import { ChatInputCommandInteraction } from "discord.js";
import ModuleCommands from "../ModuleSystem/CommandDetails";
import Module from "../ModuleSystem/Module";

export default class Test extends Module {
	static readonly friendlyName = "Test"
	static readonly commands: ModuleCommands = {
		commandName: "testmod",
		commands: [
			{
				name: "awa",
				description: "test",
				function: "awa"
			},
			{
				name: "speak",
				description: "Speak as me!",
				function: "talk",
				arguments: [
					{
						type: "string",
						name: "message",
						description: "What you want me to say",
						required: true
					}
				]
			}
		]
	}

	awa(interaction: ChatInputCommandInteraction) {
		interaction.reply("awa")
	}

	talk(interaction: ChatInputCommandInteraction, text: string) {
		interaction.reply(text)
	}
}