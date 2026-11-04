import { ApplicationCommandType, ContextMenuCommandBuilder, Snowflake, User, UserContextMenuCommandInteraction } from "discord.js";
import EntangledModule from "../ModuleSystem/EntangledModule";

interface TreatData {
	treats: { [id: Snowflake]: number }
	messages: string[]
}

export default class Treats extends EntangledModule<TreatData> {
	static readonly friendlyName: string = "Treats"

	newData(): TreatData {
		return {
			treats: {},
			messages: [
				"@name gets a treat!"
			]
		}
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

	async setupCommands() {
		// await super.setupCommands()
		this.linkCommand("userContextMenu",
			new ContextMenuCommandBuilder()
				.setType(ApplicationCommandType.User)
				.setName("Give Treat"),
			this.handleGiveTreat
		)
	}
}