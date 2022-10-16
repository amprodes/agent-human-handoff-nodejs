const axios = require('axios');
const { struct } = require('pb-util');
const Queue = require('bull');
const resumeJobs = new Queue('resumeJobs', process.env.REDIS_URI);
const opportunityJobs = new Queue('opportunityJobs', process.env.REDIS_URI);

resumeJobs.on('cleaned', function (jobs, type) {
    console.log('Cleaned %s %s jobs', jobs.length, type);
});

opportunityJobs.on('cleaned', function (jobs, type) {
    console.log('Cleaned %s %s jobs', jobs.length, type);
});

axios.post(`${process.env.BACKEND_URI}/client/auth/login`, {
    username: process.env.BACKEND_USER,
    password: process.env.BACKEND_PASSWORD
})
    .then(async (response) => {
        console.log('logged in by token; ', response.data.data.token)
        axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.data.token}`;
    })

exports.isThereResume = async (request, response) => {
    let parserSession = request.body.sessionInfo.session.split('/'),
        userId = parserSession[parserSession.length - 1]
    let jsonResponse = await axios.post(`${process.env.BACKEND_URI}/client/api/v1/resume/list`, {
        query: {
            owner: userId
        },
    }).then(async (res) => {
        if (res.data.status === 'SUCCESS') {
            //console.log(res.data.data.data)
            return {
                session: request.body.sessionInfo.session,
                // fulfillment_response: {
                //     messages: [
                //         {
                //             text: {
                //                 text: [`Ok found your cv, is this your latest one?... ${res.data.data.data[0].filename}`]
                //             }
                //         }
                //     ]
                // },
                sessionInfo: {
                    parameters: {
                        thereIsResume: "true",
                        filename: `${res.data.data.data[0].filename}`
                    }
                }
            }
        } else {
            return {
                session: request.body.sessionInfo.session,
                // fulfillment_response: {
                //     messages: [
                //         {
                //             text: {
                //                 text: [`Oh, didn't found your cv`]
                //             }
                //         }
                //     ]
                // },
                sessionInfo: {
                    parameters: {
                        thereIsResume: "false",
                        filename: ""
                    }
                }
            }
        }
    })
    return response.json(jsonResponse);
}
exports.deleteExistingResume = async (request, response) => {

    //cleans all jobs that completed over 5 seconds ago.
    await resumeJobs.clean(5000);
    //clean all jobs that failed over 10 seconds ago.
    await resumeJobs.clean(5000, 'failed');

    let parserSession = request.body.sessionInfo.session.split('/'),
        userId = parserSession[parserSession.length - 1]
    let jsonResponse = await axios.post(`${process.env.BACKEND_URI}/client/api/v1/resume/list`, {
        query: {
            owner: userId
        },
    }).then(async (res) => {
        return await axios.delete(`${process.env.BACKEND_URI}/client/api/v1/resume/delete/${res.data.data.data[0].id}`)
            .then(async () => {
                await resumeJobs.add({ task: 'delete', filePath: `${res.data.data.data[0].filename}` })
                return {
                    session: request.body.sessionInfo.session,
                    sessionInfo: {
                        parameters: {
                            thereIsDeletedResume: "true",
                            filename: ""
                        }
                    }
                }
            })
    })
    // .then(() => {
    //     resumeJobs.add({ task: 'message', userId, userSaid, userName, filePath: `${this.filename}` });
    // })

    return response.json(jsonResponse);
}
exports.checkOpportunities = async (request, response) => {
    //cleans all jobs that completed over 5 seconds ago.
    await opportunityJobs.clean(5000);
    //clean all jobs that failed over 10 seconds ago.
    await opportunityJobs.clean(5000, 'failed');

    let parserSession = request.body.sessionInfo.session.split('/'),
        userId = parserSession[parserSession.length - 1],
        hasOpportunity,
        opportunityTitle

    try {
        return axios.post(`${process.env.BACKEND_URI}/client/api/v1/opportunities/list`, {
            query: {
                user: userId
            },
        })
            .then(async (res) => {
                if (res.data.status === 'SUCCESS') {
                    // We found an opportunity
                    hasOpportunity = true
                    opportunityTitle = res.data.data.data[0].title;
                } else {
                    // We didn't found a opportunity, let's search for an opportunity
                    hasOpportunity = false
                    await opportunityJobs.add({ userId, resume: request.body.sessionInfo.parameters.filename }, { removeOnFail: true });
                }

                return response.json({
                    session: request.body.sessionInfo.session,
                    sessionInfo: {
                        parameters: {
                            hasOpportunity
                        }
                    }
                });
            })
    } catch (e) {
        console.log(`checkOpportunities; ${e.message}... `);
    }
}
exports.isfilePresent = async (request, response) => {
    //cleans all jobs that completed over 5 seconds ago.
    await resumeJobs.clean(5000);
    //clean all jobs that failed over 10 seconds ago.
    await resumeJobs.clean(5000, 'failed');
    const isfilePresent = await resumeJobs.add({ task:'isFilePresent', resume: request.body.sessionInfo.parameters.filename }, { removeOnFail: true });
    console.log({isfilePresent})
    resumeJobs.on('completed', function (job, result) {
        // Job completed with output result!
        console.log(job, result)
      })
    if(isfilePresent){
        return response.json({
            session: request.body.sessionInfo.session,
            sessionInfo: {
                parameters: {
                    isfilePresent: 'true'
                }
            }
        });
    } else {
        return response.json({
            session: request.body.sessionInfo.session,
            sessionInfo: {
                parameters: {
                    isfilePresent: 'false'
                }
            }
        });
    }
}