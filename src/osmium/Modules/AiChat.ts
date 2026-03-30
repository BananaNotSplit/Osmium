import { ChannelType, ChatInputCommandInteraction, Client, GatewayIntentBits, Guild, Message, SendableChannels, SlashCommandBuilder, Snowflake, TextChannel } from "discord.js"
import EntangledModule from "../ModuleSystem/EntangledModule"
import OpenAI from "openai"

type MessageRole = "user"|"assistant"|"system"

//#region Stored Messages

interface StoredMessage {
	role: MessageRole
	snowflake?: Snowflake
	content: string
	influence?: string | undefined
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
	channels: { [id: Snowflake]: SendableChannels } = {}

	async getChannel(id: Snowflake): Promise<SendableChannels|undefined> {
		const cached = this.channels[id]
		if (cached) return cached
		const newChannel = await this.guild.client.channels.fetch(id)
		if (!newChannel) return
		if (!newChannel.isSendable()) return

		this.channels[id] = newChannel
		return newChannel
	}

	createSystemMessage(chat: StoredChat) {
		return `
Your goal is to roleplay as your designated character. ${chat.systemPrompt ?? ""}

# User Description
${chat.userCharacterPrompt}

# Your Description
${chat.aiCharacterPrompt}
`
	}

	async replyToChat(chat: StoredChat, asUser: boolean = false, influence?: string): Promise<StoredMessage|undefined> {
		console.group(`AI Reply: ${chat.channel}`)
		let messages: StoredMessage[] = [{
			role: "system",
			content: this.createSystemMessage(chat)
		}, ...chat.messages]

		if (asUser) {
			messages.push({role: "system", content: "Act as the user."})
		}

		if (influence) {
			messages.push({role: "system", content: influence})
		}

		let response;
		try {
			response = await this.client.chat.completions.create({
				model: "dirty-muse-writer-v01-uncensored-erotica-nsfw-i1",
				messages: messages, // we love type intersections :3,
				stop: "\n"
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
			role: asUser ? "user" : "assistant",
			content: messageContent,
			influence: influence
		}

		chat.messages.push(aiMessage)
		console.log("OK! Generation complete.")
		console.groupEnd()
		return aiMessage
	}

	async regenerate(chat: StoredChat, influence?: string) {
		const message = chat.messages.pop()
		if (!message) return

		if (message.snowflake) {
			const channel = await this.guild.client.channels.fetch(chat.channel);

			if (!channel || !channel.isTextBased()) return;

			const discordMessage = await channel.messages.fetch(message.snowflake);

			discordMessage.delete()
		}

		let newMessage = await this.replyToChat(chat, message.role === "user", influence ?? message.influence)
		if (!newMessage) {
			console.error(`Failed to send channel to reply in ${chat.channel}!`)
			return
		}
		const channel = await this.getChannel(chat.channel)
		if (!channel) {
			console.error(`Failed to get channel to reply in ${chat.channel}!`)
			return
		}
		
		const discordMessage = await channel.send(newMessage.content)
		newMessage.snowflake = discordMessage.id
	}

	async generate(chat: StoredChat, influence?: string) {
		let newMessage = await this.replyToChat(chat, undefined, influence)
		if (!newMessage) {
			console.error(`Failed to send channel to reply in ${chat.channel}!`)
			return
		}
		const channel = await this.getChannel(chat.channel)
		if (!channel) {
			console.error(`Failed to get channel to reply in ${chat.channel}!`)
			return
		}
		
		const discordMessage = await channel.send(newMessage.content)
		newMessage.snowflake = discordMessage.id
	}

	async messageCreate(message: Message, bot: boolean, fromSelf: boolean, mentioningSelf: boolean) {
		if (bot) return
		let chat = this.data.chats[message.channelId]
		if (!chat) return
		chat.messages.push({
			role: "user",
			content: message.content
		})
		if (!message.channel.isSendable()) return
		message.channel.sendTyping()
		let aiMessage = await this.replyToChat(chat)
		if (!aiMessage) {
			console.warn("All that for no message?")
			return
		}
		const reply = await message.channel.send(aiMessage.content)
		aiMessage.snowflake = reply.id
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

		if (subcommandGroup === "sysprompt") {
			await this.manageSystemPrompt(interaction, subcommand)
		} else if (subcommandGroup === "character") {
			await this.manageCharacterDescriptions(interaction, subcommand)
		} else if (subcommand === "establish") {
			await this.establishNewChat(interaction, interaction.options.getString("name", true))
		} else if (subcommand === "regenerate") {
			await this.regenerateMessage(interaction, interaction.options.getString("influence"))
		} else if (subcommand === "generate") {
			await this.generateMessage(interaction, interaction.options.getString("influence"))
		} else if (subcommand === "speak") {
			await this.speakAsBot(interaction, interaction.options.getString("message", true))
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
			chat.userCharacterPrompt = interaction.options.getString("description", true).replaceAll("\\n", "\n")
			interaction.reply({
				content: "Updated user character description.",
				flags: [ "Ephemeral" ]
			})
		}
	}

	async regenerateMessage(interaction: ChatInputCommandInteraction, influence: string|null) {
		const chat = this.getChatForInteraction(interaction)
		if (!chat) return
		interaction.reply({
			content: "Regenerating...",
			flags: [ "Ephemeral" ]
		})
		await this.regenerate(chat, influence ?? undefined)
	}

	async generateMessage(interaction: ChatInputCommandInteraction, influence: string|null) {
		const chat = this.getChatForInteraction(interaction)
		if (!chat) return
		interaction.reply({
			content: "Generating...",
			flags: [ "Ephemeral" ]
		})
		await this.generate(chat, influence ?? undefined)
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

	async speakAsBot(interaction: ChatInputCommandInteraction, message: string) {
		const chat = this.getChatForInteraction(interaction)
		if (!chat) return

		interaction.reply({
			content: "Parsing your message...",
			flags: [ "Ephemeral" ]
		})

		let newMessage: StoredMessage = {role: "assistant", content: message.replaceAll("\\n", "\n")} // allow the usage of newlines
		const channel = await this.getChannel(chat.channel)
		if (!channel) {
			console.error(`Failed to get channel to reply in ${chat.channel}!`)
			return
		}
		chat.messages.push(newMessage)

		const discordMessage = await channel.send(newMessage.content)
		newMessage.snowflake = discordMessage.id
	}

	//#endregion

	constructor(guild: Guild, client: Client<true>) {
		super(guild, client)
		this.client = new OpenAI({
			baseURL: this.data.url.baseUrl,
			apiKey: this.data.url.apiKey
		})
	}

	async setupCommands() {
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
			.addSubcommand((subcommand) => subcommand
				.setName("regenerate")
				.setDescription("Regenerates the previous message.")
				.addStringOption((option) => option
					.setName("instructions")
					.setDescription("Optional instructions to influence the AI.")
				)
			)
			.addSubcommand((subcommand) => subcommand
				.setName("generate")
				.setDescription("Generates a new message.")
				.addStringOption((option) => option
					.setName("instructions")
					.setDescription("Optional instructions to influence the AI.")
				)
			)
			.addSubcommand((subcommand) => subcommand
				.setName("speak")
				.setDescription("Send a message as the AI.")
				.addStringOption((option) => option
					.setName("message")
					.setDescription("The message contents. Use \"\\n\" for a newline.")
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