import { ApplicationCommandType, ContextMenuCommandBuilder, Interaction, Message, SlashCommandBuilder, Snowflake, User, UserContextMenuCommandInteraction } from "discord.js"
import EntangledModule from "../ModuleSystem/EntangledModule"

function XpForEachLevel(level: number, scalar: number): number {
	if (level <= 0) return 0
	return (scalar * level * (level + 1)) / 2
} // uhh chatgpt im just gonna trust you :sob: it works tho (tested it)

interface LevelingData {
	levelingScalar: number
	
	messageXp: number
	postXp: number

	levels: { [id: Snowflake]: { level: number, xp: number } }
}

export default class Leveling extends EntangledModule<LevelingData> {
	static readonly friendlyName: string = "Leveling System"

	newData(): LevelingData {
		return {
			levelingScalar: 42,
			messageXp: 5,
			postXp: 2.5,
			levels: {}
		}
	}

	grantXP(source: User, amount: number): boolean {
		console.log(`Granting ${source.displayName} ${amount} XP`)
		var record = this.data.levels[source.id]
		if (!record) {
			record = { level: 0, xp: 0 }
			this.data.levels[source.id]
		}
		record.xp += amount
		if (record.xp >= XpForEachLevel(record.level, this.data.levelingScalar)) {
			// we have leveled up
			record.level++
			record.xp = 0
			return true
		}
		return false
	}

	messageCreate(message: Message, bot: boolean, fromSelf: boolean): void {
		if (bot) return
		if (this.grantXP(message.author, this.data.messageXp))
			message.reply(`You've leveled up! You are now level ${this.data.levels[message.author.id]?.level}`)
	}

	showInfo(interaction: UserContextMenuCommandInteraction, target: User, source: User) {
		this.grantXP(target, 0) // do various things
		const record = this.data.levels[target.id]
		if (record) {
			interaction.reply(`Info about <@${target.id}>:
* Level ${record.level}
* XP: ${record.xp}`)
		} else {
			interaction.reply({
				content: "This user doesn't have any level info 🤷 Get them to start talking!",
				flags: ["Ephemeral"]
			})
		}
	}

	setupCommands(): void {
		this.linkCommand("userContextMenu",
			new ContextMenuCommandBuilder()
				.setType(ApplicationCommandType.User)
				.setName("See Level"),
			this.showInfo
		)
	}
}