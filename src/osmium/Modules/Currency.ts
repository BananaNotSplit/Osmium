import { ChatInputCommandInteraction, ComponentType, DefaultWebSocketManagerOptions, Snowflake, User } from "discord.js";
import EntangledModule from "../ModuleSystem/EntangledModule";
import ModuleCommands from "../ModuleSystem/CommandDetails";

interface CurrencyData {
	balance: {[ id: Snowflake ]: number}
	defaultBalance: number

	name: string | {plural: string, singular: string}
}

export default class Currency extends EntangledModule<CurrencyData> {
	static readonly friendlyName: string = "Economy"
	static readonly commands: ModuleCommands = {
		commandName: "economy",
		commands: [
			{
				name: "balance",
				description: "See your balance",
				function: "handleCheckBalance",
				arguments: [
					{
						type: "user",
						name: "of",
						description: "See this users balance",
						required: false
					}
				]
			},
			{
				name: "coinflip",
				description: "50/50 gamble",
				function: "handleCoinflip",
				arguments: [
					{
						type: "int",
						name: "wager",
						description: "how much money to wager on the coinflip",
						required: true,
						minimum: 5
					}
				]
			}
		]
	}

	newData(): CurrencyData {
		return {
			balance: {},
			defaultBalance: 100,
			name: {plural: "dollars", singular: "dollar"}
		}
	}

	currencyName(plural: boolean): string {
		if (typeof(this.data.name) == "string")
			return this.data.name
		return plural ? this.data.name.plural : this.data.name.singular
	}

	getBalance(user: Snowflake): number {
		if (this.data.balance[user] !== undefined)
			return this.data.balance[user]
		this.data.balance[user] = this.data.defaultBalance
		return this.data.defaultBalance
	}

	modifyBalance(user: Snowflake, update: number): {old: number, new: number} {
		let old = this.getBalance(user)
		this.data.balance[user] = this.getBalance(user) + update
		return {old, new: this.data.balance[user]}
	}

	// MARK: Commands

	handleCheckBalance(interaction: ChatInputCommandInteraction, _target?: User) {
		let target = _target ?? interaction.user
		let balance = this.getBalance(target.id)
		interaction.reply({
			content: `Balance of <@${target.id}>: ${balance} ${this.currencyName(balance !== 1)}`,
			flags: [ "SuppressNotifications" ]
		})
	}

	async handleCoinflip(interaction: ChatInputCommandInteraction, wager: number) {
		if (Math.random() >= 0.5) {
			await interaction.reply({
				content: `You lost the coinflip of ${wager} ${this.currencyName(wager !== 1)} 3:`
			})
			this.modifyBalance(interaction.user.id, -wager)
		} else {
			await interaction.reply({
				content: `You won the coinflip of ${wager} ${this.currencyName(wager !== 1)} :3`
			})
			this.modifyBalance(interaction.user.id, wager)
		}
	}
}

