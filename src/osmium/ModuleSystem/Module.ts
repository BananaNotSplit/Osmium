import { Client, Events, Guild, Message } from "discord.js"

export default abstract class Module {
	guild: Guild

	MessageCreate(message: Message, bot: boolean, fromSelf: boolean) { }

	constructor(guild: Guild, client: Client<true>) {
		this.guild = guild
		console.info(`Initializing module ${this.constructor.name}`)

		client.addListener(Events.MessageCreate, message => {
			if (message.guildId !== guild.id) return
			this.MessageCreate(message, message.author.bot, message.author === this.guild.client.user)
		})
	}

	cleanup(): void { }
}