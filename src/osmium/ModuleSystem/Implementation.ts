import { Client, GatewayIntentBits, Guild } from "discord.js"
import Module from "./Module"

export default interface ModuleImplementation {
	new (guild: Guild, client: Client<true>): Module
	readonly friendlyName: string
	readonly description?: string
	intents?: GatewayIntentBits[]
}