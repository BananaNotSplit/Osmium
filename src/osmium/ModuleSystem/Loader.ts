import { Client, Events, GatewayIntentBits, Guild, REST, Routes, Snowflake } from "discord.js";
import Module from "./Module";
import ModuleImplementation from "./Implementation";
import path from "path";
import fs from "fs";

interface GuildSpecificConfig {
	modules?: [string]
}

export default class ModuleLoader {
	dataFolderPath(guildId: string): string {
		return path.join(process.cwd(), "data", `guild_${guildId}`)
	}

	configFilePath(guildId: string): string {
		return path.join(this.dataFolderPath(guildId), "config.json")
	}

	configFile(guildId: string): GuildSpecificConfig|undefined {
		try {
			const json = fs.readFileSync(this.configFilePath(guildId), "utf-8")
			return JSON.parse(json) as GuildSpecificConfig
		} catch(err) {
			// pretend nothing happened
		}
	}

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
		const guildConfig = this.configFile(guild.id)
		// Creates a new array with the same contents.
		let targetModules = ([] as ModuleImplementation[]).concat(...this.moduleTypes) // thanks type system
		if (guildConfig && guildConfig.modules) {
			console.log("Filtering modules")
			targetModules = targetModules.filter(module => {
				//@ts-ignore
				const allowed = guildConfig.modules.includes(module.friendlyName)
				console.debug(`Module ${module.friendlyName} is ${allowed ? "allowed" : "disallowed"}`)
				return allowed
			})
		}
		console.log(`Loading ${targetModules.length} module(s)`)


		guild.commands.set([])
		console.log("Cleared commands for guild")
		const moduleArray: Module[] = []
		this.matrix[guild.id] = moduleArray
		targetModules.forEach(module => {
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