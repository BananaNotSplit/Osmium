import { ChannelType, ChatInputCommandInteraction, Client, ComponentType, GatewayIntentBits, Guild, Message, RepliableInteraction, SendableChannels, Snowflake, TextChannel } from "discord.js";
import AiChatConfig, { LiveChat, StoredChat } from "../AiChatCore";
import EntangledModule from "../ModuleSystem/EntangledModule";
import OpenAI from "openai";
import ModuleCommands from "../ModuleSystem/CommandDetails";
import Colors from "../Global/Colors";
import { DeletedMessage } from "../ModuleSystem/Module";

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
	static readonly commands: ModuleCommands = {
		commandName: "chat",
		commands: [
			{
				name: "create",
				description: "Creates an AI chat thread.",
				function: "createNamedChatThread",
				arguments: [{
					type: "string",
					name: "name",
					description: "The name of the chat.",
					required: true
				}]
			},
			{
				name: "description",
				description: "Modify a character description",
				function: "setCharacterDescription",
				arguments: [
					{
						type: "string",
						name: "character",
						description: "The character to modify.",
						required: true,
						options: [
							{name: "AI", value: "ai"},
							{name: "User", value: "user"}
						]
					},
					{
						type: "string",
						name: "description",
						description: "The new description.",
						required: true
					}
				]
			}
		]
	}

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

	async replyWithContainedMessage(interaction: RepliableInteraction, message: string, color: number, ephemeral: boolean = false) {
		interaction.reply({
			components: [
				{
					type: ComponentType.Container,
					components: [
						{
							type: ComponentType.TextDisplay,
							content: message
						}
					],
					accent_color: color
				}
			],
			flags: ephemeral ? [ "Ephemeral", "IsComponentsV2" ] : [ "IsComponentsV2" ]
		})
	}

	//#region Methods

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

		console.log("Added a new chat channel.")
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

	//#endregion

	//#region Events & Commands

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

	async messageDelete(message: DeletedMessage, bot: boolean | undefined, fromSelf: boolean, mentioningSelf: boolean) {
		if (fromSelf) return
		const liveChat = this.liveChats[message.channelId]
		if (!liveChat) return
		const index = liveChat.messages.findIndex(item => item.snowflake === message.id)
		if (index === -1) {
			console.warn("A message was deleted in a live chat, but that message is not in the history!")
			return
		}
		liveChat.messages.splice(index, 1)
	}

	async createNamedChatThread(interaction: ChatInputCommandInteraction, name: string) {
		if (this.liveChats[interaction.channelId]) {
			await this.replyWithContainedMessage(interaction, "There is already a chat here!", Colors.error, true)
			return
		}
		if (!interaction.channel) {
			await this.replyWithContainedMessage(interaction, "You have to run this command in a channel.", Colors.error, true)
			return
		}
		if (!interaction.channel.isSendable()) {
			await this.replyWithContainedMessage(interaction, "I don't have permission to make a thread here.", Colors.error, true)
			return
		}

		if (!(interaction.channel instanceof TextChannel)) {
			await this.replyWithContainedMessage(interaction, "I can only make chats in text channels.", Colors.error, true)
			return
		}

		const thread = await interaction.channel.threads.create({
			type: ChannelType.PrivateThread,
			name: name
		})
		this.createChat(thread)

		await this.replyWithContainedMessage(interaction, `Your new chat is in <#${thread.id}>`, Colors.success, true)
	}

	async setCharacterDescription(interaction: ChatInputCommandInteraction, character: "ai"|"user", description: string) {
		const chat = this.liveChats[interaction.channelId]
		if (!chat) {
			await this.replyWithContainedMessage(interaction, "This command can only be ran in a chat.", Colors.error, true)
			return
		}
		if (character === "ai") {
			chat.aiDescription = description
		} else {
			chat.userDescription = description
		}

		await this.replyWithContainedMessage(interaction, "Done!", Colors.success, true)
	}

	//#endregion

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