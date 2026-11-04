import { ApplicationCommandType, ContextMenuCommandBuilder, GuildMember, Message, Snowflake, User, UserContextMenuCommandInteraction } from "discord.js";
import EntangledModule from "../ModuleSystem/EntangledModule";

interface PregnancyData {
	timers: { [id: Snowflake]: number|undefined }
	// Maps a role to who it can't get pregnant.
	infertile?: { [id: Snowflake]: Snowflake }
}

export default class Pregnancy extends EntangledModule<PregnancyData> {
	static readonly friendlyName = "Pregnancy"

	newData(): PregnancyData {
		return {
			timers: {}
		}
	}

	async canGetPregnant(target: User, source: User): Promise<boolean> {
		if (this.data.infertile === undefined) return true
		
		let targetMember = this.guild.members.resolve(target)
		let sourceMember = this.guild.members.resolve(source)
		
		if (targetMember === null || sourceMember === null) return false
		let q = Object.entries(this.data.infertile)
		for (let i = 0; i < q.length; i++) {
			let entry = q[i]
			if (!entry) break
			let infertileFrom = entry[0]
			let infertileTo = entry[1]

			let infertileFromRole = await this.guild.roles.fetch(infertileFrom)
			let infertileToRole = await this.guild.roles.fetch(infertileTo)

			let targetIsInfertile = targetMember.roles.cache.has(infertileTo)
			let sourceIsInfertile = sourceMember.roles.cache.has(infertileFrom)

			if (targetIsInfertile && sourceIsInfertile) return false
		}

		return true
	}

	async giveBirth(user: Snowflake, context: Message) {
		context.reply({
			content: "buh"
		})
	}

	async tickDownTimerIfPresent(user: Snowflake, context: Message) {
		if (this.data.timers[user] === undefined) return

		this.data.timers[user] -= 1
		if ( this.data.timers[user] <= 0) {
			this.data.timers[user] = undefined
			await this.giveBirth(user, context)
		}
	}

	breed(user: Snowflake): boolean {
		if (Math.random() <= -2 || this.data.timers[user] !== undefined) return false
		this.data.timers[user] = Math.floor(Math.random() * 80)
		return true
	}

	async messageCreate(message: Message, bot: boolean, fromSelf: boolean, mentioningSelf: boolean) {
		await this.tickDownTimerIfPresent(message.author.id, message)
	}

	async handleBreed(interaction: UserContextMenuCommandInteraction, target: User, source: User) {
		if (target.id === source.id) {
			interaction.reply({
				content: `You can't get yourself pregnant, goober!`
			})
			return
		}
		if (!await this.canGetPregnant(target, source)) {
			interaction.reply({
				content: `You can't get this goober pregnant!`
			})
			return
		}
		if (this.breed(target.id))
		await interaction.reply({
			content: `<@${source.id}> got <@${target.id}> pregnant!`
		})
		else
			await interaction.reply({
			content: `<@${source.id}> tried to get <@${target.id}> pregnant, but failed~`
		})
	}

	async setupCommands() {
		await super.setupCommands()
		this.linkCommand("userContextMenu",
			new ContextMenuCommandBuilder()
				.setType(ApplicationCommandType.User)
				.setName("Get Pregnant"),
			this.handleBreed
		)
	}
}
