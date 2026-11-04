import { ApplicationCommandType, ChatInputCommandInteraction, ContextMenuCommandBuilder, Snowflake, User, UserContextMenuCommandInteraction } from "discord.js";
import EntangledModule from "../ModuleSystem/EntangledModule";
import ModuleCommands from "../ModuleSystem/CommandDetails";

interface TreatData {
	treats: { [id: Snowflake]: number }
	messages: string[]
}

export default class Treats extends EntangledModule<TreatData> {
	static readonly friendlyName: string = "Treats"
	static readonly commands: ModuleCommands = {
		commandName: "treat",
		commands: [
			{
				name: "leaderboard",
				description: "See the top ten people who have recieved the most treats",
				function: "handleLeaderboard"
			}
		]
	}

	newData(): TreatData {
		return {
			treats: {},
			messages: [
				"@name gets a treat!"
			]
		}
	}

	getTopTen(): [Snowflake, Number][] {
		return Object.entries(this.data.treats)
			.sort((x, y) => y[1] - x[1])
			.slice(0, 10);
	}

	getLeaderboard() {
		var message = "Treat Leaderboard:"
		let lines = this.getTopTen().map(([id, treats]) => {
			return `- <@${id}> has gotten ${treats} treat${treats === 1 ? "" : "s"}`
		})
		for (let i = 0; i < lines.length; i++) {
			message += "\n" + lines[i]
		}
		return message
	}

	getTreatMessage(pet: User): string {
		let raw = this.data.messages[Math.floor(Math.random() * this.data.messages.length)] || `Sorry @name, but something broke when trying to give you a treat!`
		return raw.replace("@name", `<@${pet.id}>`)
	}

	getTreats(user: Snowflake): number {
		if(this.data.treats[user]) {
			return this.data.treats[user]
		}
		return 0
	}

	giveTreat(user: Snowflake) {
		this.data.treats[user] = this.getTreats(user) + 1
	}

	async handleGiveTreat(interaction: UserContextMenuCommandInteraction, target: User, source: User) {
		this.giveTreat(target.id)
		await interaction.reply({
			content: this.getTreatMessage(target)
		})
		this.data
	}

	async handleLeaderboard(interaction: ChatInputCommandInteraction) {
		interaction.reply({
			content: this.getLeaderboard()
		})
	}

	async setupCommands() {
		await super.setupCommands()
		this.linkCommand("userContextMenu",
			new ContextMenuCommandBuilder()
				.setType(ApplicationCommandType.User)
				.setName("Give Treat"),
			this.handleGiveTreat
		)
	}
}