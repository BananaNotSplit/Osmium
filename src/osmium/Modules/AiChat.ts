import {  Client, GatewayIntentBits, Guild, Message, Snowflake } from "discord.js"
import EntangledModule from "../ModuleSystem/EntangledModule"
import OpenAI from "openai"

type MessageRole = "user"|"assistant"|"system"

//#region Stored Messages

interface StoredMessage {
	role: MessageRole
	// snowflake: Snowflake
	content: string
}

interface StoredChat {
	channel: Snowflake
	messages: StoredMessage[]
	userCharacterPrompt: string
	aiCharacterPrompt: string
	systemPrompt?: string
}

//#endregion

//#region Config

interface URLConfig {
	baseUrl: string,
	apiKey?: string
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

	//#region Chatting [ main ]

	client: OpenAI

	createSystemMessage(chat: StoredChat) {
		return `
Your goal is to roleplay as your designated character. ${chat.systemPrompt ?? ""}

# User Description
${chat.userCharacterPrompt}

# Your Description
${chat.aiCharacterPrompt}
`
	}

	async replyToChat(chat: StoredChat): Promise<StoredMessage|undefined> {
		console.group(`AI Reply: ${chat.channel}`)
		const messages: StoredMessage[] = [{
			role: "system",
			content: this.createSystemMessage(chat)
		}, ...chat.messages]

		let response;
		try {
			response = await this.client.chat.completions.create({
				model: "dirty-muse-writer-v01-uncensored-erotica-nsfw-i1",
				messages: messages, // we love type intersections :3
			});
		} catch(err) {
			console.error(`OpenAI API error: ${err}`)
			console.groupEnd()
			return
		}

		if (!response.choices?.length) {
      	console.error("OpenAI API returned no choices:", response)
			console.groupEnd()
      	return
    	}

		const message = response.choices[0]

		if (!message) {
			console.error("OpenAI API responded with a completion that had no 0th message!")
			console.groupEnd()
			return
		}

		const messageContent = message.message.content

		if (!messageContent) {
			console.error("OpenAI API responded with a completion that had a 0th message, but it was empty!")
			console.groupEnd()
			return
		}

		const aiMessage: StoredMessage = {
			role: "assistant",
			content: messageContent
		}

		chat.messages.push(aiMessage)
		console.log("OK! Generation complete.")
		console.groupEnd()
		return aiMessage
	}

	messageCreate(message: Message, bot: boolean, fromSelf: boolean, mentioningSelf: boolean): void {
		if (bot) return
		let chat = this.data.chats[message.channelId]
		if (!chat) return
		chat.messages.push({
			role: "user",
			content: message.content
		})
		if (!message.channel.isSendable()) return
		message.channel.sendTyping()
		this.replyToChat(chat).then((reply) => {
			if (!reply) {
				console.warn("All that for no message?")
				return
			}
			message.reply(reply.content)
		})
		// message.reply(this.createSystemMessage({
		// 	channel: "a",
		// 	messages: [],
		// 	userCharacterPrompt: "User character info\n\n# something important\n very important yes",
		// 	aiCharacterPrompt: "uhh woman stand, woman go, man stand, man go",
		// }))
	}

	//#endregion

	constructor(guild: Guild, client: Client<true>) {
		super(guild, client)
		this.client = new OpenAI({
			baseURL: this.data.url.baseUrl,
			apiKey: this.data.url.apiKey
		})
	}
}