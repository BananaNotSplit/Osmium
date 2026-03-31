import { ChannelType, ChatInputCommandInteraction, Client, ComponentType, GatewayIntentBits, Guild, InteractionResponse, Message as DiscordMessage, RepliableInteraction, SendableChannels, Snowflake, TextChannel } from "discord.js";
import AiChatConfig, { LiveChat, Message, StoredChat } from "../AiChatCore";
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
				name: "regenerate",
				description: "Regenerates the AIs last message.",
				function: "regenerateMessage",
				arguments: [{
					type: "string",
					name: "prompt",
					description: "The prompt to influence the AI..",
					required: false
				}]
			}
		],
		commandGroups: [{
			name: "character",
			description: "Manage character descriptions.",
			commands: [
				{
					name: "ai",
					description: "Update the AI character description.",
					function: "updateAiCharacterDescription",
					arguments: [
						{
							type: "string",
							name: "description",
							description: "The new character description.",
							required: true
						}
					]
				},
				{
					name: "user",
					description: "Update the user character description.",
					function: "updateUserCharacterDescription",
					arguments: [
						{
							type: "string",
							name: "description",
							description: "The new character description.",
							required: true
						}
					]
				}
			]
		}]
	}

	newData(): AiChatConfig {
		return {
			url: {
				baseUrl: "http://localhost:1234",
				apiKey: null
			},
			model: "",
			chats: [],
			systemPrompt: `
Your goal is to roleplay as your designated character.
@{systemPrompt}

# Your Description
@{aiCharacter}

# User Description
@{userCharacter}
`
		}
	}

	systemMessage(chat: LiveChat): Message {
		return {
			role: "system",
			content: this.data.systemPrompt
			.replaceAll("@{systemPrompt}", chat.systemPrompt ?? "")
			.replace("@{aiCharacter}", chat.aiDescription)
			.replace("@{userCharacter}", chat.userDescription),
			snowflake: null
		}
	}

	get discordClient(): Client { return this.guild.client }

	liveChats: { [channel: Snowflake]: LiveChat }
	aiClient: OpenAI

	async replyWithContainedMessage(interaction: RepliableInteraction, message: string, color: number, ephemeral: boolean = false) {
		return await interaction.reply({
			components: [{
				type: ComponentType.Container,
				components: [{
					type: ComponentType.TextDisplay,
					content: message
				}],
				accent_color: color
			}],
			flags: ephemeral ? [ "Ephemeral", "IsComponentsV2" ] : [ "IsComponentsV2" ]
		})
	}

	async editReplyWithContainedMessage(interaction: InteractionResponse, message: string, color: number) {
		return await interaction.edit({
			components: [{
				type: ComponentType.Container,
				components: [{
					type: ComponentType.TextDisplay,
					content: message
				}],
				accent_color: color
			}]
		})
	}

	//#region Methods

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
	async sendMessage(chat: LiveChat, message: string): Promise<DiscordMessage> {
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
		let messages: Message[] = [this.systemMessage(chat)].concat(...chat.messages)
		if (prompt) 
			messages.push({
				role: "system",
				content: prompt,
				snowflake: null
			})
		
		const apiResult = await this.aiClient.chat.completions.create({
			model: this.data.model,
			messages: messages,
			stop: "\n"
		})
		const messageInfo = apiResult.choices[0]
		if (!messageInfo)
			throw GenerationError.gotNoCompletion
		
		const messageContent = messageInfo.message.content
		if (!messageContent)
			throw GenerationError.noMessageContent

		return messageContent
	}

	async replyToChat(chat: LiveChat, typing: boolean = false, prompt?: string): Promise<DiscordMessage> {
		const channel = await chat.getChannel(this.discordClient)
		let interval: NodeJS.Timeout|undefined = undefined
		if (typing) {
			console.log(`Sending typing in ${channel.id}`)
			channel.sendTyping()
			interval = setInterval(() => {
				console.log(`Resending typing in ${channel.id}`)
				channel.sendTyping()
			}, 9000)
		}

		const text = await this.generateMessage(chat, prompt).catch(err => {
			if (interval) 
				clearInterval(interval)
			throw err
		})
		
		if (interval) {
			clearInterval(interval)
			console.log(`Stopped sending typing in ${channel.id}`)
		}

		return await this.sendMessage(chat, text)
	}

	//#endregion

	//#region Events & Commands

	async messageCreate(message: DiscordMessage, bot: boolean, fromSelf: boolean, mentioningSelf: boolean) {
		if (fromSelf) return
		const liveChat = this.liveChats[message.channelId]
		if (!liveChat) return
		liveChat.messages.push({
			role: "user",
			content: message.content,
			snowflake: message.id
		})

		await this.replyToChat(liveChat, true, undefined)
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

	async updateAiCharacterDescription(interaction: ChatInputCommandInteraction, description: string) {
		const liveChat = this.liveChats[interaction.channelId]
		if (!liveChat) {
			this.replyWithContainedMessage(interaction, "This command can only be ran in a chat.", Colors.error, true)
			return
		}
		liveChat.aiDescription = description
		this.replyWithContainedMessage(interaction, "Done! AI description updated.", Colors.success, true)
	}

	async updateUserCharacterDescription(interaction: ChatInputCommandInteraction, description: string) {
		const liveChat = this.liveChats[interaction.channelId]
		if (!liveChat) {
			this.replyWithContainedMessage(interaction, "This command can only be ran in a chat.", Colors.error, true)
			return
		}
		liveChat.userDescription = description
		this.replyWithContainedMessage(interaction, "Done! user description updated.", Colors.success, true)
	}

	async regenerateMessage(interaction: ChatInputCommandInteraction, prompt?: string) {
		const liveChat = this.liveChats[interaction.channelId]
		if (!liveChat) {
			this.replyWithContainedMessage(interaction, "This command can only be ran in a chat.", Colors.error, true)
			return
		}
		const messageInfo = liveChat.messages.pop()
		if (!messageInfo) {
			this.replyWithContainedMessage(interaction, "There is no message to regenerate.", Colors.error, true)
			return
		}
		if (messageInfo.role === "user") {
			this.replyWithContainedMessage(interaction, "Only AI messages can be regenerated.", Colors.error, true)
			liveChat.messages.push(messageInfo)
			return
		}
		const channel = await liveChat.getChannel(this.discordClient)
		if (messageInfo.snowflake) {
			const message = await channel.messages.fetch(messageInfo.snowflake)
			message.delete()
		}

		const interactionResponse = await this.replyWithContainedMessage(interaction, "Regenerating...", Colors.changing, true)

		await this.replyToChat(liveChat, true, prompt)

		this.editReplyWithContainedMessage(interactionResponse, "Done!", Colors.success)
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