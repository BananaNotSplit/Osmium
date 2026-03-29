import { Message } from "discord.js";
import Module from "../ModuleSystem/Module";

export default class ColonThree extends Module {
	static readonly friendlyName: string = ":3"

	async messageCreate(message: Message, bot: boolean, fromSelf: boolean, mentioningSelf: boolean): Promise<void> {
		if (fromSelf) return
		if (message.content === ":3")
			message.reply(Math.floor((Math.random() * 100) + 1) === 100 ? ">:3c" : ":3")
	}
}