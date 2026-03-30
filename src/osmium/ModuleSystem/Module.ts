import { ChatInputCommandInteraction, Client, ContextMenuCommandBuilder, Events, Guild, Interaction, Message, OmitPartialGroupDMChannel, PartialMessage, SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder, User, UserContextMenuCommandInteraction } from "discord.js"

type CommandConfig<T extends "slash" | "userContextMenu"> = {
    slash: {
        info: SlashCommandBuilder|SlashCommandSubcommandsOnlyBuilder,
        method: (interaction: ChatInputCommandInteraction) => void
    },
    userContextMenu: {
        info: ContextMenuCommandBuilder,
        method: (interaction: UserContextMenuCommandInteraction, target: User, source: User) => void
    }
}[T]

export type DeletedMessage = OmitPartialGroupDMChannel<Message<boolean> | PartialMessage<boolean>>

export default abstract class Module {
	guild: Guild

	async messageCreate(message: Message, bot: boolean, fromSelf: boolean, mentioningSelf: boolean) { }

	async addressMessageCreate(message: Message) {
		if (message.guildId !== this.guild.id) return
		try {
			await this.messageCreate(
				message,
				message.author.bot,
				message.author === this.guild.client.user,
				message.mentions.has(this.guild.client.user)
			)
		} catch(err) {
			console.error(`Module ${this.constructor.name}.messageCreate errored:`)
			console.error(err)
		}
	}

	async messageDelete(message: DeletedMessage, bot: boolean|undefined, fromSelf: boolean, mentioningSelf: boolean) { }

	async addressMessageDete(message: DeletedMessage) {
		if (message.guildId !== this.guild.id) return
		try {
			await this.messageDelete(
				message,
				message.author?.bot,
				message.author?.id === this.guild.client.user.id,
				message.mentions.has(this.guild.client.user)
			)
		} catch(err) {
			console.error(`Module ${this.constructor.name}.messageDelete errored:`)
			console.error(err)
		}
	}

	constructor(guild: Guild, client: Client<true>) {
		this.guild = guild
		console.info(`Initializing module ${this.constructor.name}`)

		client.on(Events.MessageCreate, message => this.addressMessageCreate(message))
		client.on(Events.MessageDelete, message => this.addressMessageDete(message))

		this.setupCommands()
	}
	protected linkCommand<T extends
	"slash" |
	"userContextMenu"
	> (
		type: T,
		info: CommandConfig<T>["info"],
		method: CommandConfig<T>["method"]
	): void {
		this.guild.client.application.commands.create(info, this.guild.id)
		.then(command => {
			this.guild.client.on(Events.InteractionCreate, interaction => {
				try {
					if (interaction.guildId !== this.guild.id) return // skip other guilds
					//@ts-ignore fuck it we ball
					if (interaction.commandName !== command.name) return //skip other commands
					if (interaction.isUserContextMenuCommand() && type === "userContextMenu") {
						//@ts-ignore they are already doing something wrong if this errors
						method.call(this, interaction, interaction.targetUser, interaction.user) // keep this context
					}
					if (interaction.isChatInputCommand() && type === "slash") {
						//@ts-ignore see above
						method.call(this, interaction)
					}
				} catch(err) {
					console.error(`Module ${this.constructor.name} ${type} command ${info.name} errored:`)
					console.error(err)
				}
			})
		})
	}

	setupCommands(): void { }

	cleanup(): void { }
}