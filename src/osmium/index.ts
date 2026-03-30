import ModuleLoader from "./ModuleSystem/Loader";
import { readdirSync } from "fs";
import { join } from "path";
import ModuleImplementation from "./ModuleSystem/Implementation";
import { ActivityType, Client, ComponentType, Events, SendableChannels } from "discord.js";
import Colors from "./Global/Colors";

interface GlobalConfig {
	token: string
	modules?: string[]
	logChannel: string
}

const data = require("../../data/global.json") as GlobalConfig
const loader = new ModuleLoader()

type Constructor = new (...args: any[]) => any

function isvalidModule(module: Function & { prototype: any }): module is ModuleImplementation {
	return Object.hasOwn(module, "friendlyName") //only required field for ModuleImplementation
}

function shouldLoadModule(module: ModuleImplementation): boolean {
	if (!data.modules) return true
	return data.modules.includes(module.friendlyName)
}

async function loadModules(modulesDir: string = join(__dirname, "Modules")) {
	const files = readdirSync(modulesDir).filter(
		(f) => f.endsWith(".js")
	);

	for (const file of files) {
		const filePath = join(modulesDir, file);
		const module = await import(filePath);

		for (const [exportName, exported] of Object.entries(module)) {
			if (!exported) continue
			if (exportName !== "default") continue // each file should only output one module, as default
			if (typeof exported !== "object") continue

			if (!Object.hasOwn(exported, exportName)) continue
			//@ts-ignore We assure the existence of this field above.
			const module = exported[exportName]

			if (typeof module !== "function") continue
			if (!isvalidModule(module)) continue

			if (shouldLoadModule(module)) loader.use(module)
		}
	}
}


async function main() {
	await loadModules()
	console.log(`Loading ${loader.moduleTypes.length} modules`)
	const client = new Client({ intents: [loader.requiredIntents()] })
	let loggingChannel: SendableChannels

	process.on("SIGINT", async () => {
		await loggingChannel.send({
			components: [{
				type: ComponentType.Container,
				components: [
					{
						type: ComponentType.TextDisplay,
						content: "# Shutdown"
					},
					{
						type: ComponentType.TextDisplay,
						content: "Node.JS recieved a shutdown signal."
					}
				],
				accent_color: Colors.error
			}],
			flags: [ "IsComponentsV2" ]
		})
		console.group("Shutdown")
		loader.cleanup(client)
		process.exit(0)
	})

	process.on('uncaughtException', async (err) => {
		console.error('Uncaught exception:', err)
		let components: {
    		type: ComponentType.TextDisplay;
    		content: string;
		}[] = [
			{
				type: ComponentType.TextDisplay,
				content: "# Shutdown"
			},
			{
				type: ComponentType.TextDisplay,
				content: "Critical error encountered"
			},
			{
				type: ComponentType.TextDisplay,
				content: "## Type"
			},
			{
				type: ComponentType.TextDisplay,
				content: err.name ?? "Unknown Error"
			},
			{
				type: ComponentType.TextDisplay,
				content: "## Message"
			},
			{
				type: ComponentType.TextDisplay,
				content: err.message ?? "No Error Description"
			}
		]
		if (err.stack) {
			components.push({
				type: ComponentType.TextDisplay,
				content: "## Stack Trace"
			}, {
				type: ComponentType.TextDisplay,
				content: err.stack
			})
		}

		try {
			await loggingChannel.send({
			components: [{
				type: ComponentType.Container,
				components: components,
				accent_color: Colors.error
			}],
			flags: [ "IsComponentsV2" ]
		})
		} catch(err) {
			console.error("Failed to log in Discord:", err)
		}

  		// Optionally: gracefully shut down instead of silently continuing
		console.group("Unexpected shutdown")
		loader.cleanup(client)
		process.exit(1)
	})


	client.on(Events.ClientReady, async (truthfulClient) => {
		truthfulClient.user.setActivity({ name: `Osmium - Modules: ${loader.moduleTypes.length}`, type: ActivityType.Custom})
		loader.startup(truthfulClient)
		const channel = await truthfulClient.channels.fetch(data.logChannel)
		if (!channel) {
			throw Error("Failed to get logging channel!")
		}
		if (channel?.isSendable()) {
			loggingChannel = channel
		}
		await loggingChannel.send({
			components: [{
				type: ComponentType.Container,
				components: [
					{
						type: ComponentType.TextDisplay,
						content: "# Startup"
					},
					{
						type: ComponentType.TextDisplay,
						content: `Successfully set up ${loader.moduleTypes.length} module(s)`
					}
				],
				accent_color: Colors.success
			}],
			flags: [ "IsComponentsV2" ]
		})
	})

	await client.login(data.token)
}

main()