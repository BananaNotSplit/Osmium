import { Client, SendableChannels, Snowflake } from "discord.js";
import EntangledModule from "./ModuleSystem/EntangledModule";

export class ChatError extends Error {
	static readonly channelNotSendable: ChatError = new ChatError("The channel for an AI chat is not sendable.", "ChannelNotSendable")
	static readonly invalidChannel: ChatError = new ChatError("The channel for an AI chat could not be fetched.", "InvalidChannel")
	static readonly messageTooBig: ChatError = new ChatError("The message to send as the AI was over 2,000 characters.", "MessageTooBig")
	private constructor(message: string, name: string) {
		super(message)
		this.name = name
	}
}

type MessageRole = "assistant" | "user" | "system"

export interface Message {
	role: MessageRole
	content: string
	snowflake: Snowflake|null
}

export interface StoredChat {
	channel: Snowflake
	userDescription: string
	aiDescription: string
	systemPrompt: string|null
	creator?: Snowflake|null
	messages: Message[]
}

export class LiveChat {
	chat: StoredChat

	//#region Property Accessors
	
	get userDescription(): string { return this.chat.userDescription }
	set userDescription(v: string) { this.chat.userDescription = v }
	get aiDescription(): string { return this.chat.aiDescription }
	set aiDescription(v: string) { this.chat.aiDescription = v }
	get systemPrompt(): string|null { return this.chat.systemPrompt }
	set systemPrompt(v: string|null) { this.chat.systemPrompt = v }
	get messages(): Message[] { return this.chat.messages }
	set messages(v: Message[]) { this.chat.messages = v }
	get channelId(): Snowflake { return this.chat.channel }
	set channelId(v: Snowflake) { this.chat.channel = v }
	get creator(): Snowflake|null { if (this.chat.creator === undefined) return null; return this.chat.creator }
	set creator(v: Snowflake|null) { this.chat.creator = v }
	
	//#endregion

	async getChannel(client: Client): Promise<SendableChannels> {
		const channel = await client.channels.fetch(this.channelId)
		if (!channel)
			throw ChatError.invalidChannel
		if (!channel.isSendable())
			throw ChatError.channelNotSendable
		return channel
	}

	registerMessage(content: string, role: MessageRole, snowflake: Snowflake|null = null) {
		this.messages.push({
			content: content,
			role: role,
			snowflake: snowflake
		})
	}

	/**
	 * Speaks as the AI.
	 * @param content The message to send.
	 * @param client The client to send the message with.
	 */
	async sayAsAssistant(content: string, client: Client) {
		const channel = await this.getChannel(client)
		const message = await channel.send(content)
		this.registerMessage(content, "assistant", message.id)
	}

	async deleteLastMessage(client: Client): Promise<MessageRole|null> {
		const messageInfo = this.messages.pop()
		if (!messageInfo)
			return null
		const snowflake = messageInfo.snowflake
		if (!snowflake)
			return null
		const message = await (await this.getChannel(client)).messages.fetch(snowflake)
		await message.delete()

		return messageInfo.role
	}

	async getMessageById(id: Snowflake): Promise<[Message, number]|null> {
		this.messages.forEach((message, index) => {
			if (message.snowflake === id)
				return [message, index]
		})
		return null
	}

	constructor(chat: StoredChat) {
		this.chat = chat
	}
}

interface UrlConfig {
	baseUrl: string
	apiKey: string|null
}

export default interface AiChatConfig {
	url: UrlConfig
	model: string
	chats: StoredChat[]
	systemPrompt: string
}