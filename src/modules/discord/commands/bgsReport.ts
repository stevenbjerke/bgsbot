/*
 * KodeBlox Copyright 2017 Sayak Mukhopadhyay
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http: //www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as discord from 'discord.js';
import * as request from 'request-promise-native';
import * as moment from 'moment';
import App from '../../../server';
import { Responses } from '../responseDict';
import { DB } from '../../../db/index';
import { Access } from './../access';
import { EBGSFactionsV4WOHistory, EBGSSystemsV4WOHistory, FieldRecordSchema, TickV4, EBGSFactionsV4 } from "../../../interfaces/typings";
import { OptionsWithUrl, FullResponse } from 'request-promise-native';
import { RichEmbed } from 'discord.js';
import { AutoReport } from '../../cron/autoReport';
import { FdevIds } from '../../../fdevids';
import { Tick } from './tick';

export class BGSReport {
    db: DB;
    tickTime: string;
    constructor() {
        this.db = App.db;
        this.tickTime = "";
    }
    exec(message: discord.Message, commandArguments: string): void {
        let argsArray: string[] = [];
        if (commandArguments.length !== 0) {
            argsArray = commandArguments.split(" ");
        }
        if (argsArray.length > 0) {
            let command = argsArray[0].toLowerCase();
            if (this[command]) {
                this[command](message, argsArray);
            } else {
                message.channel.send(Responses.getResponse(Responses.NOTACOMMAND));
            }
        } else {
            message.channel.send(Responses.getResponse(Responses.NOPARAMS));
        }
    }

    async get(message: discord.Message, argsArray: string[]) {
        try {
            await Access.has(message.author, message.guild, [Access.ADMIN, Access.BGS, Access.FORBIDDEN]);
            if (argsArray.length === 1) {
                let guildId = message.guild.id;
                try {
                    let embedArray = await this.getBGSReportEmbed(guildId, message.channel as discord.TextChannel);
                    for (let index = 0; index < embedArray.length; index++) {
                        await message.channel.send(embedArray[index]);
                    }
                } catch (err) {
                    message.channel.send(Responses.getResponse(Responses.FAIL));
                    App.bugsnagClient.client.notify(err);
                    console.log(err);
                }
            } else {
                message.channel.send(Responses.getResponse(Responses.TOOMANYPARAMS));
            }
        } catch (err) {
            message.channel.send(Responses.getResponse(Responses.INSUFFICIENTPERMS));
        }
    }

    async settime(message: discord.Message, argsArray: string[]) {
        try {
            await Access.has(message.author, message.guild, [Access.ADMIN, Access.BGS, Access.FORBIDDEN]);
            if (argsArray.length === 2) {
                let guildId = message.guild.id;
                let time = argsArray[1].split(':').map(element => {
                    return parseInt(element);
                });
                if (time.length === 3
                    && time[0] >= 0 && time[0] < 24
                    && time[1] >= 0 && time[1] < 59
                    && time[2] >= 0 && time[2] < 59) {
                    try {
                        let guild = await this.db.model.guild.findOneAndUpdate(
                            { guild_id: guildId },
                            {
                                updated_at: new Date(),
                                bgs_time: time.map(element => {
                                    let elementString = element.toString();
                                    if (elementString.length === 1) {
                                        elementString = `0${elementString}`;
                                    }
                                    return elementString;
                                }).join(":")
                            },
                            { new: true });
                        if (guild) {
                            message.channel.send(Responses.getResponse(Responses.SUCCESS));
                            AutoReport.createJob(guild, message.client);
                        } else {
                            try {
                                await message.channel.send(Responses.getResponse(Responses.FAIL));
                                message.channel.send(Responses.getResponse(Responses.GUILDNOTSETUP));
                            } catch (err) {
                                App.bugsnagClient.client.notify(err, {
                                    metaData: {
                                        guild: guild._id
                                    }
                                });
                                console.log(err);
                            }
                        }
                    } catch (err) {
                        message.channel.send(Responses.getResponse(Responses.FAIL));
                        App.bugsnagClient.client.notify(err);
                        console.log(err);
                    }
                } else {
                    try {
                        await message.channel.send(Responses.getResponse(Responses.FAIL));
                        message.channel.send("Time must be of the form HH:mm:ss");
                    } catch (err) {
                        App.bugsnagClient.client.notify(err);
                        console.log(err);
                    }
                }
            } else if (argsArray.length > 2) {
                message.channel.send(Responses.getResponse(Responses.TOOMANYPARAMS));
            } else {
                message.channel.send(Responses.getResponse(Responses.NOPARAMS));
            }
        } catch (err) {
            message.channel.send(Responses.getResponse(Responses.INSUFFICIENTPERMS));
        }
    }

    async showtime(message: discord.Message, argsArray: string[]) {
        try {
            await Access.has(message.author, message.guild, [Access.ADMIN, Access.BGS, Access.FORBIDDEN]);
            if (argsArray.length === 1) {
                let guildId = message.guild.id;

                try {
                    let guild = await this.db.model.guild.findOne({ guild_id: guildId });
                    if (guild) {
                        if (guild.bgs_time && guild.bgs_time.length !== 0) {
                            let embed = new discord.RichEmbed();
                            embed.setTitle("BGS Reporting Time");
                            embed.setColor([255, 0, 255]);
                            embed.addField("Ids and Names", `${guild.bgs_time} UTC`);
                            embed.setTimestamp(new Date());
                            try {
                                message.channel.send(embed);
                            } catch (err) {
                                App.bugsnagClient.client.notify(err, {
                                    metaData: {
                                        guild: guild._id
                                    }
                                });
                                console.log(err);
                            }
                        } else {
                            try {
                                await message.channel.send(Responses.getResponse(Responses.FAIL));
                                message.channel.send("You don't have a bgs reporting time set up");
                            } catch (err) {
                                App.bugsnagClient.client.notify(err, {
                                    metaData: {
                                        guild: guild._id
                                    }
                                });
                                console.log(err);
                            }
                        }
                    } else {
                        try {
                            await message.channel.send(Responses.getResponse(Responses.FAIL));
                            message.channel.send(Responses.getResponse(Responses.GUILDNOTSETUP));
                        } catch (err) {
                            App.bugsnagClient.client.notify(err, {
                                metaData: {
                                    guild: guild._id
                                }
                            });
                            console.log(err);
                        }
                    }
                } catch (err) {
                    message.channel.send(Responses.getResponse(Responses.FAIL));
                    App.bugsnagClient.client.notify(err);
                    console.log(err);
                }
            } else {
                message.channel.send(Responses.getResponse(Responses.TOOMANYPARAMS));
            }
        } catch (err) {
            message.channel.send(Responses.getResponse(Responses.INSUFFICIENTPERMS));
        }
    }

    async unsettime(message: discord.Message, argsArray: string[]) {
        try {
            await Access.has(message.author, message.guild, [Access.ADMIN, Access.BGS, Access.FORBIDDEN]);
            if (argsArray.length === 1) {
                let guildId = message.guild.id;

                try {
                    let guild = await this.db.model.guild.findOneAndUpdate(
                        { guild_id: guildId },
                        {
                            updated_at: new Date(),
                            $unset: { bgs_time: 1 }
                        });
                    if (guild) {
                        message.channel.send(Responses.getResponse(Responses.SUCCESS));
                        AutoReport.deleteJob(guild, message.client);
                    } else {
                        try {
                            await message.channel.send(Responses.getResponse(Responses.FAIL));
                            message.channel.send(Responses.getResponse(Responses.GUILDNOTSETUP));
                        } catch (err) {
                            App.bugsnagClient.client.notify(err, {
                                metaData: {
                                    guild: guild._id
                                }
                            });
                            console.log(err);
                        }
                    }
                } catch (err) {
                    message.channel.send(Responses.getResponse(Responses.FAIL));
                    App.bugsnagClient.client.notify(err);
                    console.log(err);
                }
            } else {
                message.channel.send(Responses.getResponse(Responses.TOOMANYPARAMS));
            }
        } catch (err) {
            message.channel.send(Responses.getResponse(Responses.INSUFFICIENTPERMS));
        }
    }

    public async getBGSReportEmbed(guildId: string, channel: discord.TextChannel): Promise<RichEmbed[]> {
        try {
            let tick = new Tick();
            this.tickTime = (await tick.getTickData()).updated_at;
        } catch (err) {
            this.tickTime = "";
            App.bugsnagClient.client.notify(err);
            console.log(err);
        }
        let guild = await this.db.model.guild.findOne({ guild_id: guildId });
        if (guild) {
            let fdevIds = await FdevIds.getIds();
            let primaryFactions: string[] = [];
            let secondaryFactions: string[] = [];
            let allMonitoredFactionsUsed: string[] = [];
            guild.monitor_factions.forEach(faction => {
                if (faction.primary) {
                    primaryFactions.push(faction.faction_name);
                } else {
                    secondaryFactions.push(faction.faction_name);
                }
            });
            let allMonitoredFactions = primaryFactions.concat(secondaryFactions);
            let primarySystems: string[] = [];
            let secondarySystems: string[] = []
            guild.monitor_systems.forEach(system => {
                if (system.primary) {
                    primarySystems.push(system.system_name);
                } else {
                    secondarySystems.push(system.system_name);
                }
            });

            let primarySystemPromises: Promise<[string, string, string]>[] = [];
            let secondarySystemPromises: Promise<[string, string, string]>[] = [];

            primarySystems.forEach(system => {
                primarySystemPromises.push((async () => {
                    let requestOptions: OptionsWithUrl = {
                        url: "https://elitebgs.app/api/ebgs/v4/systems",
                        qs: { name: system.toLowerCase() },
                        json: true,
                        resolveWithFullResponse: true
                    }
                    let response: FullResponse = await request.get(requestOptions);
                    if (response.statusCode == 200) {
                        let body: EBGSSystemsV4WOHistory = response.body;
                        if (body.total === 0) {
                            return [system, `${this.acronym(system)} System not found\n`, system] as [string, string, string];
                        } else {
                            let systemResponse = body.docs[0];
                            let primaryFactionPromises: Promise<[string, string, number]>[] = [];
                            let secondaryFactionPromises: Promise<[string, string, number]>[] = [];
                            let noFactionMonitoredInSystem = true;
                            for (let faction of systemResponse.factions) {
                                if (primaryFactions.indexOf(faction.name) !== -1 || secondaryFactions.indexOf(faction.name) !== -1) {
                                    noFactionMonitoredInSystem = false;
                                    break;
                                }
                            }
                            systemResponse.factions.forEach(faction => {
                                if (primaryFactions.indexOf(faction.name) !== -1) {
                                    allMonitoredFactionsUsed.push(faction.name);
                                    primaryFactionPromises.push((async () => {
                                        let requestOptions: OptionsWithUrl = {
                                            url: "https://elitebgs.app/api/ebgs/v4/factions",
                                            qs: { name: faction.name_lower, count: 2 },
                                            json: true,
                                            resolveWithFullResponse: true
                                        }
                                        let response: FullResponse = await request.get(requestOptions);
                                        if (response.statusCode == 200) {
                                            let body: EBGSFactionsV4 = response.body;
                                            if (body.total === 0) {
                                                return [`${this.acronym(faction.name)} Faction not found\n`, faction.name, 0] as [string, string, number];
                                            } else {
                                                let factionResponse = body.docs[0];
                                                let systemIndex = factionResponse.faction_presence.findIndex(element => {
                                                    return element.system_name === system;
                                                });
                                                if (systemIndex !== -1) {
                                                    let factionName = factionResponse.name;
                                                    let influence = 0;
                                                    let influenceDifference = 0;
                                                    let happiness = "";
                                                    let activeStatesArray = [];
                                                    let pendingStatesArray = [];
                                                    factionResponse.faction_presence.forEach(systemElement => {
                                                        if (systemElement.system_name_lower === system.toLowerCase()) {
                                                            influence = systemElement.influence;
                                                            happiness = fdevIds.happiness[systemElement.happiness].name;
                                                            activeStatesArray = systemElement.active_states;
                                                            pendingStatesArray = systemElement.pending_states;
                                                            let filtered = factionResponse.history.filter(system => {
                                                                return system.system_lower === systemElement.system_name_lower;
                                                            });
                                                            if (filtered.length > 2) {
                                                                influenceDifference = influence - filtered[1].influence;
                                                            }
                                                        }
                                                    });
                                                    let factionDetail = "";
                                                    let influenceDifferenceText;
                                                    if (influenceDifference > 0) {
                                                        influenceDifferenceText = `📈${(influenceDifference * 100).toFixed(1)}%`;
                                                    } else if (influenceDifference < 0) {
                                                        influenceDifferenceText = `📉${(-influenceDifference * 100).toFixed(1)}%`;
                                                    } else {
                                                        influenceDifferenceText = `🔷${(influenceDifference * 100).toFixed(1)}%`;
                                                    }
                                                    factionDetail += `Current ${this.acronym(factionName)} Influence : ${(influence * 100).toFixed(1)}%${influenceDifferenceText}\n`;
                                                    factionDetail += `Current ${this.acronym(factionName)} Happiness : ${happiness}\n`;

                                                    let activeStates: string = "";
                                                    if (activeStatesArray.length === 0) {
                                                        activeStates = "None";
                                                    } else {
                                                        activeStatesArray.forEach((activeState, index, factionActiveStates) => {
                                                            activeStates = `${activeStates}${fdevIds.state[activeState.state].name}`;
                                                            if (index !== factionActiveStates.length - 1) {
                                                                activeStates = `${activeStates}, `
                                                            }
                                                        });
                                                    }

                                                    let pendingStates: string = "";
                                                    if (pendingStatesArray.length === 0) {
                                                        pendingStates = "None";
                                                    } else {
                                                        pendingStatesArray.forEach((pendingState, index, factionPendingStates) => {
                                                            let trend = this.getTrendIcon(pendingState.trend);
                                                            pendingStates = `${pendingStates}${fdevIds.state[pendingState.state].name}${trend}`;
                                                            if (index !== factionPendingStates.length - 1) {
                                                                pendingStates = `${pendingStates}, `
                                                            }
                                                        });
                                                    }

                                                    factionDetail += `Active ${this.acronym(factionName)} State : ${activeStates}\n`;
                                                    factionDetail += `Pending ${this.acronym(factionName)} State : ${pendingStates}\n`;
                                                    return [factionDetail, factionName, influence] as [string, string, number];
                                                } else {
                                                    return [`${this.acronym(faction.name)} Faction not found\n`, "", 0] as [string, string, number];
                                                }
                                            }
                                        } else {
                                            throw new Error(response.statusMessage);
                                        }
                                    })());
                                } else if (secondaryFactions.indexOf(faction.name) !== -1 || noFactionMonitoredInSystem) {
                                    if (secondaryFactions.indexOf(faction.name) !== -1) {
                                        allMonitoredFactionsUsed.push(faction.name);
                                    }
                                    secondaryFactionPromises.push((async () => {
                                        let requestOptions: OptionsWithUrl = {
                                            url: "https://elitebgs.app/api/ebgs/v4/factions",
                                            qs: { name: faction.name_lower },
                                            json: true,
                                            resolveWithFullResponse: true
                                        }
                                        let response: FullResponse = await request.get(requestOptions);
                                        if (response.statusCode == 200) {
                                            let body: EBGSFactionsV4WOHistory = response.body;
                                            if (body.total === 0) {
                                                return [`${this.acronym(faction.name)} Faction not found\n`, faction.name, 0] as [string, string, 0];
                                            } else {
                                                let factionResponse = body.docs[0];
                                                let systemIndex = factionResponse.faction_presence.findIndex(element => {
                                                    return element.system_name === system;
                                                });
                                                if (systemIndex !== -1) {
                                                    let factionName = factionResponse.name;
                                                    let influence = 0;
                                                    let happiness = "";
                                                    let activeStatesArray = [];
                                                    let pendingStatesArray = [];
                                                    factionResponse.faction_presence.forEach(systemElement => {
                                                        if (systemElement.system_name_lower === system.toLowerCase()) {
                                                            influence = systemElement.influence;
                                                            happiness = fdevIds.happiness[systemElement.happiness].name;
                                                            activeStatesArray = systemElement.active_states;
                                                            pendingStatesArray = systemElement.pending_states;
                                                        }
                                                    });

                                                    let activeStates: string = "";
                                                    if (activeStatesArray.length === 0) {
                                                        activeStates = "None";
                                                    } else {
                                                        activeStatesArray.forEach((activeState, index, factionActiveStates) => {
                                                            activeStates = `${activeStates}${fdevIds.state[activeState.state].name}`;
                                                            if (index !== factionActiveStates.length - 1) {
                                                                activeStates = `${activeStates}, `
                                                            }
                                                        });
                                                    }

                                                    let pendingStates: string = "";
                                                    if (pendingStatesArray.length === 0) {
                                                        pendingStates = "None";
                                                    } else {
                                                        pendingStatesArray.forEach((pendingState, index, factionPendingStates) => {
                                                            let trend = this.getTrendIcon(pendingState.trend);
                                                            pendingStates = `${pendingStates}${fdevIds.state[pendingState.state].name}${trend}`;
                                                            if (index !== factionPendingStates.length - 1) {
                                                                pendingStates = `${pendingStates}, `
                                                            }
                                                        });
                                                    }
                                                    let factionDetail = `Current ${this.acronym(factionName)} Influence : ${(influence * 100).toFixed(1)}% (Currently in ${activeStates}. Pending ${pendingStates}) and ${happiness}\n`;
                                                    return [factionDetail, factionName, influence] as [string, string, number];
                                                } else {
                                                    return [`${this.acronym(faction.name)} Faction not found\n`, "", 0] as [string, string, number];
                                                }
                                            }
                                        } else {
                                            throw new Error(response.statusMessage);
                                        }
                                    })());
                                }
                            });
                            let promises = await Promise.all([Promise.all(primaryFactionPromises), Promise.all(secondaryFactionPromises)]);
                            let primaryFieldRecord: FieldRecordSchema[] = [];
                            let secondaryFieldRecord: FieldRecordSchema[] = [];
                            promises[0].forEach(promise => {
                                primaryFieldRecord.push({
                                    fieldTitle: "",
                                    fieldDescription: promise[0],
                                    influence: promise[2],
                                    name: promise[1]
                                });
                            });
                            promises[1].forEach(promise => {
                                secondaryFieldRecord.push({
                                    fieldTitle: "",
                                    fieldDescription: promise[0],
                                    influence: promise[2],
                                    name: promise[1]
                                });
                            });
                            if (guild.sort && guild.sort_order && guild.sort_order !== 0) {
                                primaryFieldRecord.sort((a, b) => {
                                    if (guild.sort === 'name') {
                                        if (guild.sort_order === -1) {
                                            if (a.name.toLowerCase() < b.name.toLowerCase()) {
                                                return 1;
                                            } else if (a.name.toLowerCase() > b.name.toLowerCase()) {
                                                return -1;
                                            } else {
                                                return 0;
                                            }
                                        } else if (guild.sort_order === 1) {
                                            if (a.name.toLowerCase() < b.name.toLowerCase()) {
                                                return -1;
                                            } else if (a.name.toLowerCase() > b.name.toLowerCase()) {
                                                return 1;
                                            } else {
                                                return 0;
                                            }
                                        } else {
                                            return 0;
                                        }
                                    } else if (guild.sort === 'influence') {
                                        if (guild.sort_order === -1) {
                                            return b.influence - a.influence;
                                        } else if (guild.sort_order === 1) {
                                            return a.influence - b.influence;
                                        } else {
                                            return 0;
                                        }
                                    } else {
                                        return 0;
                                    }
                                });
                                secondaryFieldRecord.sort((a, b) => {
                                    if (guild.sort === 'name') {
                                        if (guild.sort_order === -1) {
                                            if (a.name.toLowerCase() < b.name.toLowerCase()) {
                                                return 1;
                                            } else if (a.name.toLowerCase() > b.name.toLowerCase()) {
                                                return -1;
                                            } else {
                                                return 0;
                                            }
                                        } else if (guild.sort_order === 1) {
                                            if (a.name.toLowerCase() < b.name.toLowerCase()) {
                                                return -1;
                                            } else if (a.name.toLowerCase() > b.name.toLowerCase()) {
                                                return 1;
                                            } else {
                                                return 0;
                                            }
                                        } else {
                                            return 0;
                                        }
                                    } else if (guild.sort === 'influence') {
                                        if (guild.sort_order === -1) {
                                            return b.influence - a.influence;
                                        } else if (guild.sort_order === 1) {
                                            return a.influence - b.influence;
                                        } else {
                                            return 0;
                                        }
                                    } else {
                                        return 0;
                                    }
                                });
                            }
                            let joined = "";
                            let updateMoment = moment(systemResponse.updated_at);
                            let tickMoment = moment(this.tickTime);
                            let suffix = updateMoment.isAfter(tickMoment) ? "after" : "before";
                            joined += `Last Updated : ${updateMoment.fromNow()}, ${updateMoment.from(tickMoment, true)} ${suffix} last detected tick \n`;
                            primaryFieldRecord.concat(secondaryFieldRecord).forEach(record => {
                                joined += record.fieldDescription;
                            });
                            return [system, joined, system] as [string, string, string];
                        }
                    } else {
                        throw new Error(response.statusMessage);
                    }
                })());
            });
            secondarySystems.forEach(system => {
                secondarySystemPromises.push((async () => {
                    let requestOptions: OptionsWithUrl = {
                        url: "https://elitebgs.app/api/ebgs/v4/systems",
                        qs: { name: system.toLowerCase() },
                        json: true,
                        resolveWithFullResponse: true
                    }
                    let response: FullResponse = await request.get(requestOptions);
                    if (response.statusCode == 200) {
                        let body: EBGSSystemsV4WOHistory = response.body;
                        if (body.total === 0) {
                            return [system, `${this.acronym(system)} System not found\n`, system] as [string, string, string];
                        } else {
                            let systemResponse = body.docs[0];
                            let primaryFactionPromises: Promise<[string, string, number]>[] = [];
                            let secondaryFactionPromises: Promise<[string, string, number]>[] = [];
                            let noFactionMonitoredInSystem = true;
                            for (let faction of systemResponse.factions) {
                                if (primaryFactions.indexOf(faction.name) !== -1 || secondaryFactions.indexOf(faction.name) !== -1) {
                                    noFactionMonitoredInSystem = false;
                                    break;
                                }
                            }
                            systemResponse.factions.forEach(faction => {
                                if (primaryFactions.indexOf(faction.name) !== -1) {
                                    allMonitoredFactionsUsed.push(faction.name);
                                    primaryFactionPromises.push((async () => {
                                        let requestOptions: OptionsWithUrl = {
                                            url: "https://elitebgs.app/api/ebgs/v4/factions",
                                            qs: { name: faction.name_lower },
                                            json: true,
                                            resolveWithFullResponse: true
                                        }
                                        let response: FullResponse = await request.get(requestOptions);
                                        if (response.statusCode == 200) {
                                            let body: EBGSFactionsV4WOHistory = response.body;
                                            if (body.total === 0) {
                                                return [`${this.acronym(faction.name)} Faction not found\n`, faction.name, 0] as [string, string, number];
                                            } else {
                                                let factionResponse = body.docs[0];
                                                let systemIndex = factionResponse.faction_presence.findIndex(element => {
                                                    return element.system_name === system;
                                                });
                                                if (systemIndex !== -1) {
                                                    let factionName = factionResponse.name;
                                                    let influence = 0;
                                                    let happiness = "";
                                                    let activeStatesArray = [];
                                                    let pendingStatesArray = [];
                                                    factionResponse.faction_presence.forEach(systemElement => {
                                                        if (systemElement.system_name_lower === system.toLowerCase()) {
                                                            influence = systemElement.influence;
                                                            happiness = fdevIds.happiness[systemElement.happiness].name;
                                                            activeStatesArray = systemElement.active_states;
                                                            pendingStatesArray = systemElement.pending_states;
                                                        }
                                                    });
                                                    let updatedAt = moment(systemResponse.updated_at);

                                                    let activeStates: string = "";
                                                    if (activeStatesArray.length === 0) {
                                                        activeStates = "None";
                                                    } else {
                                                        activeStatesArray.forEach((activeState, index, factionActiveStates) => {
                                                            activeStates = `${activeStates}${fdevIds.state[activeState.state].name}`;
                                                            if (index !== factionActiveStates.length - 1) {
                                                                activeStates = `${activeStates}, `
                                                            }
                                                        });
                                                    }

                                                    let pendingStates: string = "";
                                                    if (pendingStatesArray.length === 0) {
                                                        pendingStates = "None";
                                                    } else {
                                                        pendingStatesArray.forEach((pendingState, index, factionPendingStates) => {
                                                            let trend = this.getTrendIcon(pendingState.trend);
                                                            pendingStates = `${pendingStates}${fdevIds.state[pendingState.state].name}${trend}`;
                                                            if (index !== factionPendingStates.length - 1) {
                                                                pendingStates = `${pendingStates}, `
                                                            }
                                                        });
                                                    }
                                                    let factionDetail = `Current ${this.acronym(factionName)} Influence : ${(influence * 100).toFixed(1)}% (Currently in ${activeStates}. Pending ${pendingStates}) and ${happiness}\n`;
                                                    return [factionDetail, factionName, influence] as [string, string, number];
                                                } else {
                                                    return [`${this.acronym(faction.name)} Faction not found\n`, "", 0] as [string, string, number];
                                                }
                                            }
                                        } else {
                                            throw new Error(response.statusMessage);
                                        }
                                    })());
                                } else if (secondaryFactions.indexOf(faction.name) !== -1 || noFactionMonitoredInSystem) {
                                    if (secondaryFactions.indexOf(faction.name) !== -1) {
                                        allMonitoredFactionsUsed.push(faction.name);
                                    }
                                    secondaryFactionPromises.push((async () => {
                                        let requestOptions: OptionsWithUrl = {
                                            url: "https://elitebgs.app/api/ebgs/v4/factions",
                                            qs: { name: faction.name_lower },
                                            json: true,
                                            resolveWithFullResponse: true
                                        }
                                        let response: FullResponse = await request.get(requestOptions);
                                        if (response.statusCode == 200) {
                                            let body: EBGSFactionsV4WOHistory = response.body;
                                            if (body.total === 0) {
                                                return [`${this.acronym(faction.name)} Faction not found\n`, faction.name, 0] as [string, string, number];
                                            } else {
                                                let factionResponse = body.docs[0];
                                                let systemIndex = factionResponse.faction_presence.findIndex(element => {
                                                    return element.system_name === system;
                                                });
                                                if (systemIndex !== -1) {
                                                    let factionName = factionResponse.name;
                                                    let influence = 0;
                                                    let happiness = "";
                                                    let activeStatesArray = [];
                                                    let pendingStatesArray = [];
                                                    factionResponse.faction_presence.forEach(systemElement => {
                                                        if (systemElement.system_name_lower === system.toLowerCase()) {
                                                            influence = systemElement.influence;
                                                            happiness = fdevIds.happiness[systemElement.happiness].name;
                                                            activeStatesArray = systemElement.active_states;
                                                            pendingStatesArray = systemElement.pending_states;
                                                        }
                                                    });

                                                    let activeStates: string = "";
                                                    if (activeStatesArray.length === 0) {
                                                        activeStates = "None";
                                                    } else {
                                                        activeStatesArray.forEach((activeState, index, factionActiveStates) => {
                                                            activeStates = `${activeStates}${fdevIds.state[activeState.state].name}`;
                                                            if (index !== factionActiveStates.length - 1) {
                                                                activeStates = `${activeStates}, `
                                                            }
                                                        });
                                                    }

                                                    let pendingStates: string = "";
                                                    if (pendingStatesArray.length === 0) {
                                                        pendingStates = "None";
                                                    } else {
                                                        pendingStatesArray.forEach((pendingState, index, factionPendingStates) => {
                                                            let trend = this.getTrendIcon(pendingState.trend);
                                                            pendingStates = `${pendingStates}${fdevIds.state[pendingState.state].name}${trend}`;
                                                            if (index !== factionPendingStates.length - 1) {
                                                                pendingStates = `${pendingStates}, `
                                                            }
                                                        });
                                                    }
                                                    let factionDetail = `${this.acronym(factionName)} : ${(influence * 100).toFixed(1)}% (${activeStates}. Pending ${pendingStates}) ${happiness}\n`;
                                                    return [factionDetail, factionName, influence] as [string, string, number];
                                                } else {
                                                    return [`${this.acronym(faction.name)} Faction not found\n`, "", 0] as [string, string, number];
                                                }
                                            }
                                        } else {
                                            throw new Error(response.statusMessage);
                                        }
                                    })());
                                }
                            });
                            let promises = await Promise.all([Promise.all(primaryFactionPromises), Promise.all(secondaryFactionPromises)]);
                            let primaryFieldRecord: FieldRecordSchema[] = [];
                            let secondaryFieldRecord: FieldRecordSchema[] = [];
                            promises[0].forEach(promise => {
                                primaryFieldRecord.push({
                                    fieldTitle: "",
                                    fieldDescription: promise[0],
                                    influence: promise[2],
                                    name: promise[1]
                                });
                            });
                            promises[1].forEach(promise => {
                                secondaryFieldRecord.push({
                                    fieldTitle: "",
                                    fieldDescription: promise[0],
                                    influence: promise[2],
                                    name: promise[1]
                                });
                            });
                            if (guild.sort && guild.sort_order && guild.sort_order !== 0) {
                                primaryFieldRecord.sort((a, b) => {
                                    if (guild.sort === 'name') {
                                        if (guild.sort_order === -1) {
                                            if (a.name.toLowerCase() < b.name.toLowerCase()) {
                                                return 1;
                                            } else if (a.name.toLowerCase() > b.name.toLowerCase()) {
                                                return -1;
                                            } else {
                                                return 0;
                                            }
                                        } else if (guild.sort_order === 1) {
                                            if (a.name.toLowerCase() < b.name.toLowerCase()) {
                                                return -1;
                                            } else if (a.name.toLowerCase() > b.name.toLowerCase()) {
                                                return 1;
                                            } else {
                                                return 0;
                                            }
                                        } else {
                                            return 0;
                                        }
                                    } else if (guild.sort === 'influence') {
                                        if (guild.sort_order === -1) {
                                            return b.influence - a.influence;
                                        } else if (guild.sort_order === 1) {
                                            return a.influence - b.influence;
                                        } else {
                                            return 0;
                                        }
                                    } else {
                                        return 0;
                                    }
                                });
                                secondaryFieldRecord.sort((a, b) => {
                                    if (guild.sort === 'name') {
                                        if (guild.sort_order === -1) {
                                            if (a.name.toLowerCase() < b.name.toLowerCase()) {
                                                return 1;
                                            } else if (a.name.toLowerCase() > b.name.toLowerCase()) {
                                                return -1;
                                            } else {
                                                return 0;
                                            }
                                        } else if (guild.sort_order === 1) {
                                            if (a.name.toLowerCase() < b.name.toLowerCase()) {
                                                return -1;
                                            } else if (a.name.toLowerCase() > b.name.toLowerCase()) {
                                                return 1;
                                            } else {
                                                return 0;
                                            }
                                        } else {
                                            return 0;
                                        }
                                    } else if (guild.sort === 'influence') {
                                        if (guild.sort_order === -1) {
                                            return b.influence - a.influence;
                                        } else if (guild.sort_order === 1) {
                                            return a.influence - b.influence;
                                        } else {
                                            return 0;
                                        }
                                    } else {
                                        return 0;
                                    }
                                });
                            }
                            let updateMoment = moment(systemResponse.updated_at);
                            let tickMoment = moment(this.tickTime);
                            let suffix = updateMoment.isAfter(tickMoment) ? "after" : "before";
                            let joined = "";
                            joined += `Last Updated : ${updateMoment.fromNow()}, ${updateMoment.from(tickMoment, true)} ${suffix} last detected tick \n`;
                            primaryFieldRecord.concat(secondaryFieldRecord).forEach(record => {
                                joined += record.fieldDescription;
                            });
                            return [system, joined, system] as [string, string, string];
                        }
                    } else {
                        throw new Error(response.statusMessage);
                    }
                })());
            });
            let promises = await Promise.all([Promise.all(primarySystemPromises), Promise.all(secondarySystemPromises)]);

            let primaryFieldRecord: FieldRecordSchema[] = [];
            let secondaryFieldRecord: FieldRecordSchema[] = [];
            promises[0].forEach(promise => {
                primaryFieldRecord.push({
                    fieldTitle: promise[0],
                    fieldDescription: promise[1],
                    influence: 0,
                    name: promise[2]
                });
            });
            promises[1].forEach(promise => {
                secondaryFieldRecord.push({
                    fieldTitle: promise[0],
                    fieldDescription: promise[1],
                    influence: 0,
                    name: promise[2]
                });
            });

            let unusedFactionFetchPromises: Promise<boolean>[] = [];
            let unusedFactionsDetails: [string, string, string, string, number][] = [];
            allMonitoredFactions.forEach(faction => {
                if (allMonitoredFactionsUsed.indexOf(faction) === -1) {
                    unusedFactionFetchPromises.push((async () => {
                        let requestOptions: OptionsWithUrl = {
                            url: "https://elitebgs.app/api/ebgs/v4/factions",
                            qs: { name: faction.toLowerCase() },
                            json: true,
                            resolveWithFullResponse: true
                        }
                        let response: FullResponse = await request.get(requestOptions);
                        if (response.statusCode == 200) {
                            let body: EBGSFactionsV4WOHistory = response.body;
                            if (body.total === 0) {
                                return false;
                            } else {
                                let factionResponse = body.docs[0];
                                let factionName = factionResponse.name;
                                let influence = 0;
                                let happiness = "";
                                let activeStatesArray = [];
                                let pendingStatesArray = [];
                                factionResponse.faction_presence.forEach(systemElement => {
                                    influence = systemElement.influence;
                                    happiness = fdevIds.happiness[systemElement.happiness].name;
                                    activeStatesArray = systemElement.active_states;
                                    pendingStatesArray = systemElement.pending_states;
                                    let activeStates: string = "";
                                    if (activeStatesArray.length === 0) {
                                        activeStates = "None";
                                    } else {
                                        activeStatesArray.forEach((activeState, index, factionActiveStates) => {
                                            activeStates = `${activeStates}${fdevIds.state[activeState.state].name}`;
                                            if (index !== factionActiveStates.length - 1) {
                                                activeStates = `${activeStates}, `
                                            }
                                        });
                                    }

                                    let pendingStates: string = "";
                                    if (pendingStatesArray.length === 0) {
                                        pendingStates = "None";
                                    } else {
                                        pendingStatesArray.forEach((pendingState, index, factionPendingStates) => {
                                            let trend = this.getTrendIcon(pendingState.trend);
                                            pendingStates = `${pendingStates}${fdevIds.state[pendingState.state].name}${trend}`;
                                            if (index !== factionPendingStates.length - 1) {
                                                pendingStates = `${pendingStates}, `
                                            }
                                        });
                                    }
                                    let factionDetail = `${this.acronym(factionName)} : ${(influence * 100).toFixed(1)}% (${activeStates}. Pending ${pendingStates}) ${happiness}\n`;
                                    unusedFactionsDetails.push([systemElement.system_name, factionDetail, factionName, systemElement.updated_at, influence])
                                });
                                return true;
                            }
                        } else {
                            throw new Error(response.statusMessage);
                        }
                    })());
                }
            });
            await Promise.all(unusedFactionFetchPromises);
            if (unusedFactionsDetails.length > 0) {
                unusedFactionsDetails.sort((a, b) => {
                    return a[0].toLowerCase().localeCompare(b[0].toLowerCase())
                });
                let previousSystem = unusedFactionsDetails[0][0];
                let updateMoment = moment(unusedFactionsDetails[0][3]);
                let tickMoment = moment(this.tickTime);
                let suffix = updateMoment.isAfter(tickMoment) ? "after" : "before";
                let joined = `Last Updated : ${updateMoment.fromNow()}, ${updateMoment.from(tickMoment, true)} ${suffix} last detected tick \n`;
                unusedFactionsDetails.forEach(factionDetails => {
                    if (factionDetails[0].toLowerCase() === previousSystem.toLowerCase()) {
                        joined += factionDetails[1];
                    } else {
                        secondaryFieldRecord.push({
                            fieldTitle: previousSystem,
                            fieldDescription: joined,
                            influence: 0,
                            name: previousSystem
                        });
                        previousSystem = factionDetails[0];
                        let updateMoment = moment(factionDetails[3]);
                        let tickMoment = moment(this.tickTime);
                        let suffix = updateMoment.isAfter(tickMoment) ? "after" : "before";
                        joined = `Last Updated : ${updateMoment.fromNow()}, ${updateMoment.from(tickMoment, true)} ${suffix} last detected tick\n` + factionDetails[1];
                    }
                });
                secondaryFieldRecord.push({
                    fieldTitle: previousSystem,
                    fieldDescription: joined,
                    influence: 0,
                    name: previousSystem
                });
            }

            if (guild.sort && guild.sort_order && guild.sort_order !== 0) {
                primaryFieldRecord.sort((a, b) => {
                    if (guild.sort === 'name') {
                        if (guild.sort_order === -1) {
                            if (a.name.toLowerCase() < b.name.toLowerCase()) {
                                return 1;
                            } else if (a.name.toLowerCase() > b.name.toLowerCase()) {
                                return -1;
                            } else {
                                return 0;
                            }
                        } else if (guild.sort_order === 1) {
                            if (a.name.toLowerCase() < b.name.toLowerCase()) {
                                return -1;
                            } else if (a.name.toLowerCase() > b.name.toLowerCase()) {
                                return 1;
                            } else {
                                return 0;
                            }
                        } else {
                            return 0;
                        }
                    } else {
                        return 0;
                    }
                });
                secondaryFieldRecord.sort((a, b) => {
                    if (guild.sort === 'name') {
                        if (guild.sort_order === -1) {
                            if (a.name.toLowerCase() < b.name.toLowerCase()) {
                                return 1;
                            } else if (a.name.toLowerCase() > b.name.toLowerCase()) {
                                return -1;
                            } else {
                                return 0;
                            }
                        } else if (guild.sort_order === 1) {
                            if (a.name.toLowerCase() < b.name.toLowerCase()) {
                                return -1;
                            } else if (a.name.toLowerCase() > b.name.toLowerCase()) {
                                return 1;
                            } else {
                                return 0;
                            }
                        } else {
                            return 0;
                        }
                    } else {
                        return 0;
                    }
                });
            }
            let fieldRecord = primaryFieldRecord.concat(secondaryFieldRecord);
            let pagedFields: FieldRecordSchema[][] = [];
            let fieldsInPage: FieldRecordSchema[] = [];
            let charactersPerPageCount = 0;
            for (let index = 0; index < fieldRecord.length; index++) {
                if (fieldsInPage.length < 24) {
                    charactersPerPageCount += fieldRecord[index].fieldTitle.length + fieldRecord[index].fieldDescription.length;
                } else {
                    pagedFields.push(fieldsInPage);
                    fieldsInPage = [];
                    charactersPerPageCount = 0;
                    index--;
                }
                if (charactersPerPageCount < 5000) {
                    fieldsInPage.push(fieldRecord[index]);
                } else {
                    pagedFields.push(fieldsInPage);
                    fieldsInPage = [];
                    charactersPerPageCount = 0;
                    index--;
                }
                if (index === fieldRecord.length - 1) {
                    pagedFields.push(fieldsInPage);
                    fieldsInPage = [];
                    charactersPerPageCount = 0;
                }
            }
            let numberOfMessages = pagedFields.length;
            let embedArray: RichEmbed[] = [];
            for (let index = 0; index < numberOfMessages; index++) {
                let embed = new discord.RichEmbed();
                if (index === 0) {
                    embed.setTitle("BGS REPORT");
                } else {
                    embed.setTitle(`BGS REPORT - continued - Pg ${index + 1}`);
                }
                embed.setColor([255, 0, 255]);
                embed.setTimestamp(new Date());

                for (let pagedField of pagedFields[index]) {
                    embed.addField(pagedField.fieldTitle, pagedField.fieldDescription);
                }

                embedArray.push(embed);
            }
            return embedArray;
        } else {
            await channel.send(Responses.getResponse(Responses.FAIL));
            channel.send(Responses.getResponse(Responses.GUILDNOTSETUP));
        }
    }

    private getTrendIcon(trend: number): string {
        if (trend > 0) {
            return "⬆️";
        } else if (trend < 0) {
            return "⬇️";
        } else {
            return "↔️";
        }
    }

    private acronym(text) {
        return text
            .split(/\s/)
            .reduce((accumulator, word) => accumulator + word.charAt(0), '');
    }

    help() {
        return [
            'bgsreport',
            'Gets the BGS Report or sets, unsets, shows the time when the BGS Report will be automatically generated',
            'bgsreport <get|settime|showtime|unsettime> <time in UTC>',
            [
                '`@BGSBot bgsreport get`',
                '`@BGSBot bgsreport settime 15:25:36`',
                '`@BGSBot bgsreport showtime`',
                '`@BGSBot bgsreport unsettime`'
            ]
        ];
    }
}
