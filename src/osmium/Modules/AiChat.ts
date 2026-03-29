import { ChannelType, ChatInputCommandInteraction, Client, GatewayIntentBits, Guild, Message, SlashCommandBuilder, Snowflake, TextChannel } from "discord.js"
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
	systemPrompt?: string | undefined
}

//#endregion

//#region Config

interface URLConfig {
	baseUrl: string,
	apiKey?: string
}

interface ChannelFilter {
	mode: "whitelist"|"blacklist"
	channels: Snowflake[]
}

interface Config {
	url: URLConfig
	chats: { [id: Snowflake]: StoredChat} // store channel snowflake in chat object, and store it in table for lookup
	channelFilter?: ChannelFilter
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

	channelIsAllowedForAiChat(channel: Snowflake): boolean {
		if (!this.data.channelFilter) return true
		if (this.data.channelFilter.mode === "whitelist") {
			return this.data.channelFilter.channels.includes(channel)
		} else {
			return !this.data.channelFilter.channels.includes(channel) // blacklist
		}
	}

	//#region Command Handling

	getChatForInteraction(interaction: ChatInputCommandInteraction): StoredChat|undefined {
		const chat = this.data.chats[interaction.channelId]
		if (!chat) {
			interaction.reply({
				content: "This command can only be ran inside an AI chat.",
				flags: [ "Ephemeral" ]
			})
			return
		}
		return chat
	}

	async manageChat(interaction: ChatInputCommandInteraction) {
		const subcommand = interaction.options.getSubcommand()
		const subcommandGroup = interaction.options.getSubcommandGroup()

		if (subcommand === "establish") {
			await this.establishNewChat(interaction, interaction.options.getString("name", true))
		} else if (subcommandGroup === "sysprompt") {
			await this.manageSystemPrompt(interaction, subcommand)
		} else if (subcommandGroup === "character") {
			await this.manageCharacterDescriptions(interaction, subcommand)
		}
	}

	async manageSystemPrompt(interaction: ChatInputCommandInteraction, subcommand: string) {
		const chat = this.getChatForInteraction(interaction)
		if (!chat) return
		if (subcommand === "clear") {
			chat.systemPrompt = undefined
			interaction.reply({
				content: "Cleared system prompt!",
				flags: [ "Ephemeral" ]
			})
		} else if (subcommand === "set") {
			chat.systemPrompt = interaction.options.getString("prompt", true).replaceAll("\\n", "\n")
			interaction.reply({
				content: "Updated system prompt!",
				flags: [ "Ephemeral" ]
			})
		} else if (subcommand === "get") {
			interaction.reply({
				content: `The system prompt is\n${chat.systemPrompt ?? "nothing"}`,
				flags: [ "Ephemeral" ]
			})
		}
	}

	async manageCharacterDescriptions(interaction: ChatInputCommandInteraction, subcommand: string) {
		const chat = this.getChatForInteraction(interaction)
		if (!chat) return
		if (subcommand === "get-ai") {
			interaction.reply({
				content: `The AIs character description is\n${chat.aiCharacterPrompt}`,
				flags: [ "Ephemeral" ]
			})
		} else if (subcommand === "get-user") {
			interaction.reply({
				content: `The users character description is\n${chat.userCharacterPrompt}`,
				flags: [ "Ephemeral" ]
			})
		} else if (subcommand === "ai") {
			chat.aiCharacterPrompt = interaction.options.getString("description", true).replaceAll("\\n", "\n") // allow the usage of newlines
			interaction.reply({
				content: "Updated AI character description.",
				flags: [ "Ephemeral" ]
			})
		} else if (subcommand === "user") {
			chat.aiCharacterPrompt = interaction.options.getString("description", true).replaceAll("\\n", "\n")
			interaction.reply({
				content: "Updated user character description.",
				flags: [ "Ephemeral" ]
			})
		}
	}

	async establishNewChat(interaction: ChatInputCommandInteraction, name: string) {
		if (this.data.chats[interaction.channelId]) {
			await interaction.reply({
				content: "This is already an AI chat!",
				flags: [ "Ephemeral" ]
			})
			return
		}

		if (!this.channelIsAllowedForAiChat(interaction.channelId)) {
			await interaction.reply({
				content: "I can't create an AI chat here.",
				flags: [ "Ephemeral" ]
			})
			return
		}

		if (!(interaction.channel instanceof TextChannel)) return

		const thread = await interaction.channel.threads.create({
			name: name,
			type: ChannelType.PrivateThread
		})
		
		interaction.reply({
			content: `Your chat has been created in <#${thread.id}>!`,
			flags: [ "Ephemeral" ]
		})

		await thread.send(`Welcome to your own private chat, <@${interaction.user.id}>!`)
		this.data.chats[thread.id] = {
			channel: thread.id,
			messages: [],
			userCharacterPrompt: "",
			aiCharacterPrompt: ""
		}
	}

	//#endregion

	constructor(guild: Guild, client: Client<true>) {
		super(guild, client)
		this.client = new OpenAI({
			baseURL: this.data.url.baseUrl,
			apiKey: this.data.url.apiKey
		})
	}

	setupCommands(): void {
		this.linkCommand(
			"slash",
			new SlashCommandBuilder()
			.setName("chat")
			.setDescription("Manage an AI chat.")
			.addSubcommand((subcommand) => subcommand
				.setName("establish")
				.setDescription("Creates an AI chat thread here.")
				.addStringOption((option) => option
					.setName("name")
					.setDescription("The name of the chat.")
					.setRequired(true)
				)
			)
			.addSubcommandGroup((group) => group
				.setName("sysprompt")
				.setDescription("Manage the system prompt of the AI.")
				.addSubcommand((subcommand) => subcommand
					.setName("clear")
					.setDescription("Clears the system prompt.")
				)
				.addSubcommand((subcommand) => subcommand
					.setName("get")
					.setDescription("Gets the system prompt.")
				)
				.addSubcommand((subcommand) => subcommand
					.setName("set")
					.setDescription("Sets the system prompt. Use \"\\n\" for a newline.")
					.addStringOption((option) => option
						.setName("prompt")
						.setDescription("The new system prompt.")
						.setRequired(true)
					)
				)
			)
			.addSubcommandGroup((group) => group
				.setName("character")
				.setDescription("Manage the character descriptions for both the user and the AI.")
				.addSubcommand((subcommand) => subcommand
					.setName("ai")
					.setDescription("Sets the AIs character description. Use \"\\n\" for a newline.")
					.addStringOption((option) => option
						.setName("description")
						.setDescription("The new character description.")
						.setRequired(true)
					)
				)
				.addSubcommand((subcommand) => subcommand
					.setName("get-ai")
					.setDescription("Gets the AIs character description.")
				)
				.addSubcommand((subcommand) => subcommand
					.setName("user")
					.setDescription("Sets the users character description. Use \"\\n\" for a newline.")
					.addStringOption((option) => option
						.setName("description")
						.setDescription("The new character description.")
						.setRequired(true)
					)
				)
				.addSubcommand((subcommand) => subcommand
					.setName("get-user")
					.setDescription("Gets the users character description.")
				)
			),
			this.manageChat
		)
	}
}