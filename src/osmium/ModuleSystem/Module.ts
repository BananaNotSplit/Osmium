import { ChatInputCommandInteraction, Client, ContextMenuCommandBuilder, Events, Guild, Interaction, Message, SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder, User, UserContextMenuCommandInteraction } from "discord.js"

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

export default abstract class Module {
	guild: Guild

	messageCreate(message: Message, bot: boolean, fromSelf: boolean, mentioningSelf: boolean) { }

	addressMessage(message: Message) {
		if (message.guildId !== this.guild.id) return
		try {
			this.messageCreate(
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

	constructor(guild: Guild, client: Client<true>) {
		this.guild = guild
		console.info(`Initializing module ${this.constructor.name}`)

		client.addListener(Events.MessageCreate, message => { this.addressMessage(message) })

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
			})
		})
	}

	setupCommands(): void { }

	cleanup(): void { }
}