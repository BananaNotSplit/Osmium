import fs from "fs"
import Module from "./Module"
import path from "path"
import { Guild, Client } from "discord.js"

export default abstract class EntangledModule<Data> extends Module {
	data: Data
	private interval: NodeJS.Timeout

	get dataFileName(): string { return `${this.constructor.name}.json` }

	get dataFolder(): string {
		return path.join(process.cwd(), "data", `guild_${this.guild.id}`)
	}

	get dataFilePath(): string {
		return path.join(this.dataFolder, this.dataFileName)
	}

	EnsureDataFolder() {
		if (!fs.existsSync(this.dataFolder)) {
			fs.mkdirSync(this.dataFolder, { recursive: true })
		}
	}

	abstract NewData(): Data

	Load(): ["ok"|"new", Data]|["failed", any] {
		this.EnsureDataFolder()
		if (fs.existsSync(this.dataFilePath)) {
			try {
				const json = fs.readFileSync(this.dataFilePath, "utf-8")
				return ["ok", JSON.parse(json) as Data]
			} catch(j) {
				console.error(`Error loading data for ${this.constructor.name}:`)
				console.error(j)
				return ["failed", j]
			}
		} else {
			return ["new", this.NewData()]
		}
	}

	Save() {
		this.EnsureDataFolder()
		const json = JSON.stringify(this.data, null, 3)
		try {
			fs.writeFileSync(
				this.dataFilePath,
				json,
				{
					encoding: "utf-8",
				}
			)
			console.log(`Saved data for ${this.constructor.name}`)
		} catch(j) {
			console.error(`Error saving data for ${this.constructor.name}:`)
			console.error(j)
		}
	}


	constructor(guild: Guild, client: Client<true>) {
		super(guild, client)
		const loadInfo = this.Load()
		switch (loadInfo[0]) {
			case "ok":
				this.data = loadInfo[1]
				break
			case "new":
				this.data = loadInfo[1]
				this.Save()
				break
			case "failed":
				throw loadInfo[1]
		}
		this.interval = setInterval(() => {
			
		}, 15 * 60 * 1000);
	}

	cleanup(): void {
		clearInterval(this.interval)
		this.Save()
	}
}