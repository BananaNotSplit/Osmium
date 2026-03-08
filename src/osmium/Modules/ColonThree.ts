import { Message } from "discord.js";
import Module from "../ModuleSystem/Module";

export default class ColonThree extends Module {
	static readonly friendlyName: string = ":3"


	messageCreate(message: Message, bot: boolean, fromSelf: boolean): void {
		if (fromSelf) return
		if (message.content === `<@${this.guild.client.user.id}> :3`)
			message.reply(":3")
	}
}