import ModuleLoader from "./ModuleSystem/Loader";
import { readdirSync } from "fs";
import { join } from "path";
import ModuleImplementation from "./ModuleSystem/Implementation";
import { ActivityType, Client, Events } from "discord.js";

const data = require("../../data/global.json") as { token: string }
const loader = new ModuleLoader()

type Constructor = new (...args: any[]) => any

function isvalidModule(module: Function & { prototype: any }): module is ModuleImplementation {
	return Object.hasOwn(module, "friendlyName") //only required field for ModuleImplementation
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

			console.debug(module)
			loader.use(module)
		}
	}
}


async function main() {
	await loadModules()
	console.log(`Loading ${loader.moduleTypes.length} modules`)
	const client = new Client({ intents: [loader.requiredIntents()] })

	client.on(Events.ClientReady, (truthfulClient) => {
		truthfulClient.user.setActivity({ name: `Osmium - Modules: ${loader.moduleTypes.length}`, type: ActivityType.Custom})
		loader.startup(truthfulClient)
	})

	await client.login(data.token)
}

main()