import { Client, GatewayIntentBits, Guild, SlashCommandBuilder } from "discord.js"
import Module from "./Module"
import ModuleCommands from "./CommandDetails"

export default interface ModuleImplementation {
	new (guild: Guild, client: Client<true>): Module
	readonly friendlyName: string
	readonly description?: string
	readonly intents?: GatewayIntentBits[]
	readonly commands?: ModuleCommands
}