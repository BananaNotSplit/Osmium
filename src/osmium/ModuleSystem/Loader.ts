import { Client, Events, GatewayIntentBits, Guild, REST, Routes, Snowflake } from "discord.js";
import Module from "./Module";
import ModuleImplementation from "./Implementation";

export default class ModuleLoader {
	moduleTypes: ModuleImplementation[] = []
	private matrix: { [id: Snowflake]: Module[]} = {}

	use(module: ModuleImplementation) {
		this.moduleTypes.push(module)
	}

	requiredIntents(): GatewayIntentBits {
		return this.moduleTypes
			.flatMap(module => module.intents ?? [])
			.reduce((acc, add) => acc | add, 0 as GatewayIntentBits)
			| GatewayIntentBits.Guilds
			| GatewayIntentBits.GuildMessages
	}
	
	constructGuild(guild: Guild, client: Client<true>) {
		console.groupCollapsed(`Guild construction for ${guild.id}`)
		guild.commands.set([])
		console.log("Cleared commands for guild")
		const moduleArray: Module[] = []
		this.matrix[guild.id] = moduleArray
		this.moduleTypes.forEach(module => {
			moduleArray.push(new module(guild, client))
		})
		console.groupEnd()
	}
	
	deconstructGuild(guild: Guild) {
		console.groupCollapsed(`Guild deconstruction for ${guild.id}`)
		if (this.matrix[guild.id]) {
			this.matrix[guild.id]?.forEach(module => module.cleanup())
		}
		console.groupEnd()
	}

	startup(client: Client<true>) {
		this.matrix = {}
		client.on(Events.GuildCreate, guild => this.constructGuild(guild, client))
		client.on(Events.GuildDelete, guild => this.deconstructGuild(guild))
		client.guilds.cache.forEach(guild => {
			this.constructGuild(guild, client)
		})
	}

	cleanup(client: Client) {
		for (const [id, modules] of Object.entries(this.matrix)) {
			console.groupCollapsed(`Cleanup for guild ${id}`)
			modules.forEach(module => module.cleanup())
			console.groupEnd()
		}
	}
}