import Module from "../ModuleSystem/Module";
import ModuleCommands from "../ModuleSystem/CommandDetails";
import EntangledModule from "../ModuleSystem/EntangledModule";
import { ChatInputCommandInteraction, ComponentType, GuildMemberRoleManager } from "discord.js";
import Colors from "../Global/Colors";

interface Config {
	allowedRoleIds: string[]
}

export default class SpeakJson extends EntangledModule<Config> {
	static readonly friendlyName = "Speak JSON"
	static readonly commands: ModuleCommands = {
		commandName: "speakjson",
		commands: [
			{
				name: "componentv2",
				description: "[Permission Locked] Speak JSON components.",
				function: "speakJson",
				arguments: [
					{
						type: "string",
						name: "components",
						description: "The components to speak.",
						required: true
					}
				]
			}
		]
	}

	newData(): Config {
		return {allowedRoleIds: []}
	}

	async speakJson(interaction: ChatInputCommandInteraction, components: string) {
		if (!interaction.member) {
			await interaction.reply({
				components: [{
					type: ComponentType.Container,
					components: [{
						type: ComponentType.TextDisplay,
						content: "# Error\n Only guild members can do this."
					}],
					accent_color: Colors.error
				}],
				flags: [ "IsComponentsV2", "Ephemeral" ]
			})
			return
		}
		const userRoles = interaction.member.roles
		if (!(userRoles instanceof GuildMemberRoleManager)) {
			await interaction.reply({
				components: [{
					type: ComponentType.Container,
					components: [{
						type: ComponentType.TextDisplay,
						content: "# Error\n Internal mishap."
					}],
					accent_color: Colors.error
				}],
				flags: [ "IsComponentsV2", "Ephemeral" ]
			})
			return
		}

		let allowed = false
		for (let i = 0; i < this.data.allowedRoleIds.length; i++) {
			const roleId = this.data.allowedRoleIds[i]!;
			const role = userRoles.resolve(roleId)
			allowed ||= (role !== null)
		}

		if (!allowed) {
			await interaction.reply({
				components: [{
					type: ComponentType.Container,
					components: [{
						type: ComponentType.TextDisplay,
						content: "# Error\n Insufficent permissions."
					}],
					accent_color: Colors.error
				}],
				flags: [ "IsComponentsV2", "Ephemeral" ]
			})
			return
		}

		try {
			const json = JSON.parse(components)
			if (!interaction.channel)
				throw "No Channel."

			if (!interaction.channel.isSendable())
				throw "Cannot send messages here."

			await interaction.channel.send({
				components: json,
				flags: [ "IsComponentsV2" ]
			})

			await interaction.reply({
				components: [{
					type: ComponentType.Container,
					components: [{
						type: ComponentType.TextDisplay,
						content: "# Done\n Message generated."
					}],
					accent_color: Colors.success
				}],
				flags: [ "IsComponentsV2", "Ephemeral" ]
			})
		} catch(err) {
			if (err instanceof SyntaxError) {
				await interaction.reply({
					components: [{
						type: ComponentType.Container,
						components: [{
							type: ComponentType.TextDisplay,
							content: `# Error\n Failed to parse JSON.\n${err.message}`
						}],
						accent_color: Colors.error
					}],
					flags: [ "IsComponentsV2", "Ephemeral" ]
				})
			} else {
				await interaction.reply({
					components: [{
						type: ComponentType.Container,
						components: [{
							type: ComponentType.TextDisplay,
							content: `# Error\n Failed to send message.\n${err}`
						}],
						accent_color: Colors.error
					}],
					flags: [ "IsComponentsV2", "Ephemeral" ]
				})
			}
		}
	}
}