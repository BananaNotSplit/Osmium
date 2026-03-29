import { GatewayIntentBits, Message, Snowflake } from "discord.js"
import EntangledModule from "../ModuleSystem/EntangledModule"

type MessageRole = "user"|"assistant"|"system"

//#region Stored Messages

interface StoredMessage {
	role: MessageRole
	// snowflake: Snowflake
	content: string
}

interface StoredChat {
	channel: Snowflake
	messages: [StoredMessage]
}

//#endregion

//#region Config

interface URLConfig {
	baseUrl: string,
	apikey?: string
}

interface Config {
	url: URLConfig
	chats: { [id: Snowflake]: StoredChat} // store channel snowflake in chat object, and store it in table for lookup
}

//#endregion

export default class AiChat extends EntangledModule<Config> {
	static readonly friendlyName = "AI Chat"
	static readonly intents = [GatewayIntentBits.MessageContent]
	newData(): Config {
		return {
			url: { baseUrl: "http://localhost:1234"},
			chats: {}
		}
	}

	messageCreate(message: Message, bot: boolean, fromSelf: boolean, mentioningSelf: boolean): void {
		if (bot) return
		let chat = this.data.chats[message.channelId]
		if (!chat) return
		chat.messages.push({
			role: "user",
			content: message.content
		})
	}
}