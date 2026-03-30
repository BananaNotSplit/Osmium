import { Client, GatewayIntentBits, Guild, Message, SendableChannels, Snowflake } from "discord.js";
import AiChatConfig, { LiveChat, StoredChat } from "../AiChatCore";
import EntangledModule from "../ModuleSystem/EntangledModule";
import OpenAI from "openai";

export class GenerationError extends Error {
	static readonly gotNoCompletion = new GenerationError("API returned no chat completions", "GotNoCompletion.")
	static readonly noMessageContent = new GenerationError("API returned a chat completion with an empty message.", "noMessageContent")

	private constructor(message: string, name: string) {
		super(message)
		this.name = name
	}
}

export default class AiChat extends EntangledModule<AiChatConfig> {
	static readonly friendlyName = "AI Chat"
	static readonly intents: GatewayIntentBits[] = [GatewayIntentBits.MessageContent]

	newData(): AiChatConfig {
		return {
			url: {
				baseUrl: "http://localhost:1234",
				apiKey: null
			},
			model: "",
			chats: []
		}
	}

	get discordClient(): Client { return this.guild.client }

	liveChats: { [channel: Snowflake]: LiveChat }
	aiClient: OpenAI

	load(): ["failed", any] | ["ok" | "new", AiChatConfig] {
		const result = super.load()
		return result
	}

	// An override for loading is not needed, as a LiveChat links to the chat it contains.

	createChat(channel: SendableChannels) {
		let newChat: StoredChat = {
			channel: channel.id,
			messages: [],
			userDescription: "",
			aiDescription: "",
			systemPrompt: null
		}
		this.data.chats.push(newChat)
		this.liveChats[channel.id] = new LiveChat(newChat)
	}

	/**
	 * Sends a message into the chat. Appends the message to the chat history.
	 * @param chat The chat to talk in.
	 * @param message The message to send.
	 * @returns The sent message.
	 */
	async sendMessage(chat: LiveChat, message: string): Promise<Message> {
		const channel = await chat.getChannel(this.discordClient)
		const discordMessage = await channel.send(message)

		chat.messages.push({
			role: "assistant",
			content: message,
			snowflake: discordMessage.id
		})

		return discordMessage
	}

	/**
	 * Generates a message and returns the text.
	 * @param chat The chat to ineract with..
	 * @param prompt An optional prompt for the AI.
	 * @returns The generated message.
	 */
	async generateMessage(chat: LiveChat, prompt?: string): Promise<string> {
		const apiResult = await this.aiClient.chat.completions.create({
			model: this.data.model,
			messages: chat.messages
		})
		const messageInfo = apiResult.choices[0]
		if (!messageInfo)
			throw GenerationError.gotNoCompletion
		
		const messageContent = messageInfo.message.content
		if (!messageContent)
			throw GenerationError.noMessageContent

		return messageContent
	}

	async replyToChat(chat: LiveChat, prompt?: string): Promise<Message> {
		const text = await this.generateMessage(chat, prompt)
		return await this.sendMessage(chat, text)
	}

	async messageCreate(message: Message, bot: boolean, fromSelf: boolean, mentioningSelf: boolean) {
		if (fromSelf) return
		const liveChat = this.liveChats[message.channelId]
		if (!liveChat) return
		liveChat.messages.push({
			role: "user",
			content: message.content,
			snowflake: message.id
		})

		await this.replyToChat(liveChat)
	}

	constructor(guild: Guild, client: Client<true>) {
		super(guild, client)
		this.liveChats = {}
		this.data.chats.forEach(chat => this.liveChats[chat.channel] = new LiveChat(chat))
		this.aiClient = new OpenAI({
			baseURL: this.data.url.baseUrl,
			apiKey: this.data.url.apiKey ?? undefined
		})
	}
}