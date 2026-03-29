import { ActivityType, Client, Events } from "discord.js";
import ModuleLoader from "./ModuleSystem/Loader";
import Leveling from "./Modules/Leveling";
import ColonThree from "./Modules/ColonThree";
import AiChat from "./Modules/AiChat";

const loader = new ModuleLoader()
// loader.use(Leveling)
// loader.use(ColonThree)
loader.use(AiChat)

//#region [ Main ]
const data = require("../../data/global.json") as { token: string }
const client = new Client({ intents: [loader.requiredIntents()] })

process.on("SIGINT", () => {
	console.group("Cleanup")
	loader.cleanup(client)
	process.exit(0)
})

client.login(data.token)

client.on(Events.ClientReady, client => {
	client.user.setActivity({ name: `Osmium - Modules: ${loader.moduleTypes.length}`, type: ActivityType.Custom})
	loader.startup(client)
})
//#endregion
