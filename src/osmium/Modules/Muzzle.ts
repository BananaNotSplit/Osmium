import { DMChannel, GatewayIntentBits, Message, Snowflake, TextChannel } from "discord.js";
import EntangledModule from "../ModuleSystem/EntangledModule";

const faces = new Set([
	">w<",
	">~<",
	"^w^",
	"qwq",
	":3",
	">:3",
	":3c",
	">:3c",
	"3:",
	"3:<",
	"owo",
	"uwu",
	";w;",
	"@~@",
	"@w@",
	"-w-"
])
const letters = [
	"a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
	"n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z"
]

function isLetter(char: string): boolean {
	return /^[a-zA-Z]$/.test(char)
}

function braindamage(source: string): string {
	if(faces.has(source.toLowerCase())) return source

	let copy = ""
	let factor = 0.01
	for(let index = 0; index < source.length; index++) {
		let letter = source[index]
		if(letter == undefined) break
		if(isLetter(letter)) {
			if(Math.random() < factor*3) {
				letter = letters[Math.floor(Math.random() * letters.length)] ?? "?"
				factor -= 0.1
			} else {
				factor += 0.05
			}
		}
		copy += letter
		if(isLetter(letter)) {
			if(Math.random() < factor*12) {
				for(let repeat = 0; repeat < Math.floor(Math.random() * 3) + 1; repeat++) {
					copy += letter
				}
				factor -= 0.2
			} else {
				factor += 0.1
			}
			if(Math.random() < factor*12) {
				copy += "-"
				factor -= 2
			} else if(Math.random() < factor*4) {
				for(let repeat = 0; repeat < Math.floor(Math.random() * 7) + 1; repeat++) {
					copy += "."
				}
				factor -= 0.2
			} else {
				factor += 0.1
			}
		}
	}
  return copy
}

interface MuzzleData {
	muzzleRole?: Snowflake
}

export default class Muzzle extends EntangledModule<MuzzleData> {
	static readonly friendlyName: string = "Muzzle"
	static readonly intents: GatewayIntentBits[] = [
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildMessages,
	]

	newData(): MuzzleData {
		return {}
	}

	async speakAs(user: Snowflake, channel: {send: (content: string) => Promise<Message>}, message: string) {
		await channel.send(`-# from <@${user}>\n${message}`)
	}

	async messageCreate(message: Message, bot: boolean, fromSelf: boolean, mentioningSelf: boolean): Promise<void> {
		if(this.data.muzzleRole === undefined) return
		let member = this.guild.members.resolve(message.author)
		if(member?.roles.cache.has(this.data.muzzleRole) && message.channel.isSendable()) {
			await this.speakAs(member.id, message.channel, braindamage(message.content ?? "error"))
			await message.delete()
		}
	}
}