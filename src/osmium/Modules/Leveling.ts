import { Message, Snowflake, User } from "discord.js"
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

	NewData(): LevelingData {
		return {
			levelingScalar: 42,
			messageXp: 5,
			postXp: 2.5,
			levels: {}
		}
	}

	GrantXP(source: User, amount: number): boolean {
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

	MessageCreate(message: Message, bot: boolean, fromSelf: boolean): void {
		if (bot) return
		if (this.GrantXP(message.author, this.data.messageXp))
			message.reply(`You've leveled up! You are now level ${this.data.levels[message.author.id]?.level}`)
	}
}