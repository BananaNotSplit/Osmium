import { ApplicationCommandAutocompleteNumericOptionData, ApplicationCommandAutocompleteStringOptionData, ApplicationCommandBooleanOptionData, ApplicationCommandChannelOptionData, ApplicationCommandMentionableOptionData, ApplicationCommandNonOptionsData, ApplicationCommandNumericOptionData, ApplicationCommandOptionType, ApplicationCommandRoleOptionData, ApplicationCommandStringOptionData, ApplicationCommandUserOptionData, ChannelType } from "discord.js"

type Optional<T> = T|undefined

//#region Arguments

export interface GenericOption<T> {
	name: string
	value: T
}

export interface GenericArgument<T extends string> {
	type: T
	name: string
	description: string
	required: boolean
}

export interface StringArgument extends GenericArgument<"string"> {
	options?: GenericOption<string>[]
	minimumLength?: number
	maximumLength?: number
}

export interface IntArgument extends GenericArgument<"int"> {
	options?: GenericOption<number>[]
	minimum?: number
	maximum?: number
}

export interface BoolArgument extends GenericArgument<"bool"> { }

export interface ChannelArgument extends GenericArgument<"channel"> {
	channelType?: ChannelType
}

export interface MentionArgument extends GenericArgument<"mention"> { }

export interface NumberArgument extends GenericArgument<"number"> {
	options?: GenericOption<number>[]
	minimum?: number
	maximum?: number
}

export interface RoleArgument extends GenericArgument<"role"> {
}

export interface UserArgument extends GenericArgument<"user"> {
}

export type CommandArgument =
StringArgument |
IntArgument |
BoolArgument |
ChannelArgument |
MentionArgument |
NumberArgument |
RoleArgument |
UserArgument

//#endregion

export interface Command {
	name: string
	description: string
	arguments?: CommandArgument[]
	function: string
}

export interface CommandGroup {
	name: string
	description: string
	commands: Command[]
}

export default interface ModuleCommands {
	commandName: string
	commands: Command[]
	commandGroups?: CommandGroup[]
}

export function ArguementTypeToOptionType(argument: CommandArgument): ApplicationCommandOptionType {
	switch(argument.type) {
		case "string": return ApplicationCommandOptionType.String
		case "number": return ApplicationCommandOptionType.Number
		case "int": return ApplicationCommandOptionType.Integer
		case "bool": return ApplicationCommandOptionType.Boolean
		case "channel": return ApplicationCommandOptionType.Channel
		case "mention": return ApplicationCommandOptionType.Mentionable
		case "role": return ApplicationCommandOptionType.Role
		case "user": return ApplicationCommandOptionType.User
	}
}

type Option = 
ApplicationCommandNonOptionsData |
ApplicationCommandChannelOptionData |
ApplicationCommandAutocompleteNumericOptionData |
ApplicationCommandAutocompleteStringOptionData |
ApplicationCommandNumericOptionData |
ApplicationCommandStringOptionData |
ApplicationCommandRoleOptionData |
ApplicationCommandUserOptionData |
ApplicationCommandMentionableOptionData |
ApplicationCommandBooleanOptionData

export function ArgumentToOption(argument: CommandArgument): Option {
	switch(argument.type) {
		case "string":
			return {
				type: ApplicationCommandOptionType.String,
				name: argument.name,
				description: argument.description,
				required: argument.required,
				choices: argument.options,
				minLength: argument.minimumLength,
				maxLength: argument.maximumLength
			}
		case "number":
			return {
				type: ApplicationCommandOptionType.Number,
				name: argument.name,
				description: argument.description,
				required: argument.required,
				choices: argument.options,
				minValue: argument.minimum,
				maxValue: argument.maximum
			}
		case "int":
		case "bool":
			return {
				type: ApplicationCommandOptionType.Boolean,
				name: argument.name,
				description: argument.description,
				required: argument.required
			}
		case "channel":
		case "mention":
		case "role":
		case "user":
		default:
			throw "Not Implemented"
	}
}