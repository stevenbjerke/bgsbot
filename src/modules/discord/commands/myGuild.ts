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
import App from '../../../server';
import { Responses } from '../responseDict';
import { DB } from '../../../db/index';
import { Access } from './../access';

export class MyGuild {
    db: DB;
    constructor() {
        this.db = App.db;
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

    async set(message: discord.Message, argsArray: string[]) {
        // Only the server admins can set the guild
        let member = await message.guild.fetchMember(message.author)
        if (member.hasPermission("ADMINISTRATOR")) {
            if (argsArray.length === 1) {
                let guildId = message.guild.id;

                try {
                    let guild = await this.db.model.guild.findOne({ guild_id: guildId });
                    if (guild) {
                        try {
                            await message.channel.send(Responses.getResponse(Responses.FAIL));
                            message.channel.send("Your guild is already set");
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
                            await this.db.model.guild.create({
                                guild_id: guildId,
                                updated_at: new Date(),
                            });
                            message.channel.send(Responses.getResponse(Responses.SUCCESS));
                        } catch (err) {
                            message.channel.send(Responses.getResponse(Responses.FAIL));
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
        } else {
            message.channel.send(Responses.getResponse(Responses.INSUFFICIENTPERMS));
        }
    }

    async remove(message: discord.Message, argsArray: string[]) {
        try {
            await Access.has(message.author, message.guild, [Access.ADMIN, Access.FORBIDDEN]);
            if (argsArray.length === 1) {
                let guildId = message.guild.id;

                try {
                    let guild = await this.db.model.guild.findOneAndRemove({ guild_id: guildId });
                    if (guild) {
                        message.channel.send(Responses.getResponse(Responses.SUCCESS));
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

    help() {
        return [
            'myguild',
            'Sets or removes your guild from BGSBot. Setting your guild is necessary for the bot to function',
            'myguild <set|remove>',
            [
                '`@BGSBot myguild set`',
                '`@BGSBot myguild remove`'
            ]
        ];
    }
}
