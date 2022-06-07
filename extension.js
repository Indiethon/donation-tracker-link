const fetch = require("node-fetch");
const { v4: uuid } = require('uuid');
let startTimeTimeout = false;

module.exports = (nodecg) => {

    const trackerID = nodecg.Replicant('trackerID', { defaultValue: {} });
    const runDataArray = nodecg.Replicant('runDataArray', 'nodecg-speedcontrol');
    const runDataActiveRun = nodecg.Replicant('runDataActiveRun', 'nodecg-speedcontrol');
    const timer = nodecg.Replicant('timer', 'nodecg-speedcontrol');
    const runFinishTimes = nodecg.Replicant('runFinishTimes', 'nodecg-speedcontrol');

    nodecg.listenFor('importFromTracker', async (value, ack) => {
        let res = await fetch(`${nodecg.bundleConfig.apiUrl}/speedruns/event/${value}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${nodecg.bundleConfig.token}`
            },
            dataType: 'json',
        });
        let data = await res.json();
        if (res.status !== 200) {
            switch (res.status) {
                case (401 || 403): ack(true, { error: 'Invalid token. Check your token in the config and try again.' }); break;
                case (404): ack(true, { error: 'Can\'t reach API. Are you sure the API URL is correct?' }); break;
            }
            return;
        }

        let runArray = [];
        let idArray = {};
        for (const run of data) {
            const id = uuid();
            const teamId = uuid();

            const [estHours, estMinutes, estSeconds] = run.estimate.split(':');
            const estTotalSeconds = (+estHours) * 60 * 60 + (+estMinutes) * 60 + (+estSeconds);
            const [setupHours, setupMinutes, setupSeconds] = run.setupTime.split(':');
            const setupTotalSeconds = (+setupHours) * 60 * 60 + (+setupMinutes) * 60 + (+setupSeconds);

            let startTime = new Date(run.startTime);

            let runData = {
                game: run.game,
                gameTwitch: run.game,
                system: run.console,
                region: run.region,
                category: run.category,
                estimate: run.estimate,
                estimateS: estTotalSeconds,
                setupTime: run.setupTime,
                setupTimeS: setupTotalSeconds,
                scheduled: startTime.toISOString(),
                scheduledS: startTime.getTime(),
                relay: false,
                teams: [{
                    name: '',
                    id: teamId,
                    relayPlayerID: '',
                    players: [],
                }],
                customData: {},
                id: id,
            }

            for (const runner of run.runners) {
                let runnerData = {
                    name: runner.name,
                    id: uuid(),
                    teamID: teamId,
                    country: '',
                    pronouns: runner.pronouns,
                    social: {
                        twitch: runner.twitch,
                    },
                    customData: {},
                }
                runData.teams[0].players.push(runnerData);
            }
           
            idArray[id] = run._id;
            runArray.push(runData);
        }
        runDataArray.value = runArray;
        trackerID.value = idArray;
        ack(null);
    })

    timer.on('change', async (newVal, oldVal) => {
        if (!oldVal || startTimeTimeout) return;
        if (newVal.state !== 'running' || newVal.time !== '00:00:00') return;
        if (!trackerID.value[runDataActiveRun.value.id]) return;
        startTimeTimeout = true;
        let d = new Date();
        let body = { startTime: Date.now() };
        let res = await fetch(`${nodecg.bundleConfig.apiUrl}/speedruns/startTime/${trackerID.value[runDataActiveRun.value.id]}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${nodecg.bundleConfig.token}`
            },
            body: JSON.stringify(body),
            dataType: 'json',
        });
        if (res.status !== 200) nodecg.log.error('Error when updating tracker information.')
        setTimeout(() => startTimeTimeout = false, 2000);
    })

    runDataActiveRun.on('change', async (newVal, oldVal) => {
        if (!oldVal || !newVal) return;
        const run = runDataArray.value.find(x => x.id === oldVal.id);
        if (!trackerID.value[run.id] || !runFinishTimes.value[run.id]) return;
        let res = await fetch(`${nodecg.bundleConfig.apiUrl}/speedruns/finalTime/${trackerID.value[run.id]}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${nodecg.bundleConfig.token}`
            },
            body: JSON.stringify({ finalTime: runFinishTimes.value[run.id].time }),
            dataType: 'json',
        });
        if (res.status !== 200) nodecg.log.error('Error when updating tracker information.')
    })
}