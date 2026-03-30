import { ApplicationCommandData, ApplicationCommandOptionData, ApplicationCommandOptionType, ApplicationCommandSubCommandData, ChatInputCommandInteraction, Client, ContextMenuCommandBuilder, Events, Guild, Message, OmitPartialGroupDMChannel, PartialMessage, SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder, User, UserContextMenuCommandInteraction } from "discord.js"
import ModuleImplementation from "./Implementation"
import { Command, ArgumentToOption } from "./CommandDetails"

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

	async setupCommands() {
		const info = this.constructor as ModuleImplementation
		const commands = info.commands
		if (!commands) return

		let subcommands: ApplicationCommandOptionData[] = []
		let mappedSubcommands: {[id: string]: Command} = {}
		let mappedGroupSubcommands: {[id: string]: {[id: string]: Command}} = {}

		commands.commands.forEach(command => {
			subcommands.push({
				type: ApplicationCommandOptionType.Subcommand,
				name: command.name.toLowerCase(),
				description: command.description,
				options: (command.arguments ?? []).map(argument => ArgumentToOption(argument))
			})
			mappedSubcommands[command.name.toLowerCase()] = command
		})

		if (commands.commandGroups) {
			commands.commandGroups.forEach(group => {
				mappedGroupSubcommands[group.name.toLowerCase()] = {}
				let groupCommands: ApplicationCommandSubCommandData[] = []
				group.commands.forEach(groupCommand => {
					groupCommands.push({
						type: ApplicationCommandOptionType.Subcommand,
						name: groupCommand.name.toLowerCase(),
						description: groupCommand.description,
						options: (groupCommand.arguments ?? []).map(argument => ArgumentToOption(argument))
					})
					mappedGroupSubcommands[group.name.toLowerCase()]![groupCommand.name.toLowerCase()] = groupCommand
				})

				subcommands.push({
					type: ApplicationCommandOptionType.SubcommandGroup,
					name: group.name.toLowerCase(),
					description: group.description,
					options: groupCommands
				})
			})
		}

		let data: ApplicationCommandData = {
			name: commands.commandName,
			description: info.description ?? "Module has no description.",
			options: subcommands
		}

		const command = await this.guild.commands.create(data)
		this.guild.client.on(Events.InteractionCreate, (interaction) => {
			if (interaction.guildId !== this.guild.id) return // don't process other guilds
			if (interaction.isChatInputCommand()) {
				if (interaction.commandName !== commands.commandName) return // validate it is our command
				const group = interaction.options.getSubcommandGroup()
				const subcommand = interaction.options.getSubcommand()
				const commandObject = group ? mappedGroupSubcommands[group]![subcommand] : mappedSubcommands[subcommand]

				if (!commandObject) {
					console.error(`Processed a command /${interaction.commandName} ${subcommand}, but that subcommand doesn't exist!`)
					return
				}

				const functionName = commandObject.function as keyof this
				const callable = this[functionName]
				if (!callable) {
					console.error(`Processed a command /${interaction.commandName} ${subcommand}, but that function doesn't exist!`)
					return
				}
				if (typeof callable !== "function") {
					console.error(`Processed a command /${interaction.commandName} ${subcommand}, but that is not a function!`)
					return
				}

				let arg: any[]|undefined
				if (commandObject.arguments) {
					arg = commandObject.arguments.map(argument => {
						switch (argument.type) {
						case "bool":
							return interaction.options.getBoolean(argument.name, argument.required)
						case "channel":
							return interaction.options.getChannel(argument.name, argument.required)
						case "int":
							return interaction.options.getInteger(argument.name, argument.required)
						case "mention":
							return interaction.options.getMentionable(argument.name, argument.required)
						case "number":
							return interaction.options.getNumber(argument.name, argument.required)
						case "string":
							return interaction.options.getString(argument.name, argument.required)
						case "user":
							return interaction.options.getUser(argument.name, argument.required)
						case "role":
							return interaction.options.getRole(argument.name, argument.required)
						}
					})
				}

				if (arg) {
					callable.call(this, interaction, ...arg)
				} else {
					callable.call(this, interaction)
				}
			}
		})
	}

	cleanup(): void { }
}