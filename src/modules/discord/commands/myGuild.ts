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

export class MyGuild {
    responses: Responses;
    db: DB;
    constructor() {
        this.responses = App.discordClient.responses;
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
                this[command](message, argsArray)
            } else {
                message.channel.send(this.responses.getResponse('notACommand'));
            }
        } else {
            message.channel.send(this.responses.getResponse('noParams'));
        }
    }

    set(message: discord.Message, argsArray: string[]) {
        if (argsArray.length === 1) {
            let guildId = message.guild.id;

            this.db.model.guild.findOne({ guild_id: guildId })
                .then(guild => {
                    if (guild) {
                        message.channel.send(this.responses.getResponse("fail"))
                            .then(() => {
                                message.channel.send("Your guild is already set");
                            })
                            .catch(err => {
                                console.log(err);
                            });
                    } else {
                        this.db.model.guild.create({ guild_id: guildId })
                            .then(guild => {
                                message.channel.send(this.responses.getResponse("success"));
                            })
                            .catch(err => {
                                message.channel.send(this.responses.getResponse("fail"));
                                console.log(err);
                            })
                    }
                })
                .catch(err => {
                    message.channel.send(this.responses.getResponse("fail"));
                    console.log(err);
                })
        } else {
            message.channel.send(this.responses.getResponse("tooManyParams"));
        }
    }

    remove(message: discord.Message, argsArray: string[]) {
        if (argsArray.length === 1) {
            let guildId = message.guild.id;

            this.db.model.guild.findOneAndRemove({ guild_id: guildId })
                .then(guild => {
                    message.channel.send(this.responses.getResponse("success"));
                })
                .catch(err => {
                    message.channel.send(this.responses.getResponse("fail"));
                    console.log(err);
                })
        } else {
            message.channel.send(this.responses.getResponse("tooManyParams"));
        }
    }
}