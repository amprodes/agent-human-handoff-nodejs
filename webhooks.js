const axios = require('axios');
const Queue = require('bull');
const Redis = require('ioredis');
let client,
    subscriber;
const opts = {
    // redisOpts here will contain at least a property of connectionName which will identify the queue based on its name
    createClient: function (type) {
        switch (type) {
            case 'client':
                if (!client) {
                    client = new Redis(process.env.REDIS_URI, {
                        maxRetriesPerRequest: null,
                        enableReadyCheck: false
                    });
                }
                return client;
            case 'subscriber':
                if (!subscriber) {
                    subscriber = new Redis(process.env.REDIS_URI, {
                        maxRetriesPerRequest: null,
                        enableReadyCheck: false
                    });
                }
                return subscriber;
            case 'bclient':
                return new Redis(process.env.REDIS_URI, {
                    maxRetriesPerRequest: null,
                    enableReadyCheck: false
                });
            default:
                throw new Error('Unexpected connection type: ', type);
        }
    },
    settings: {
        backoffStrategies: {
            jitter: function (attemptsMade, err) {
                return 5000 + Math.random() * 500;
            }
        }
    }
}
const resumeJobs = new Queue('resumeJobs', opts);
const opportunityJobs = new Queue('opportunityJobs', opts);

resumeJobs.on('cleaned', function (jobs, type) {
    console.log('Cleaned %s %s jobs', jobs.length, type);
});

opportunityJobs.on('cleaned', function (jobs, type) {
    console.log('Cleaned %s %s jobs', jobs.length, type);
});

exports.webhook = async (request, response) => {
    const tag = request.body.fulfillmentInfo.tag;
    let parserSession = request.body.sessionInfo.session.split('/'),
        userId = parserSession[parserSession.length - 1],
        result;
    console.log({ tag, userId })
    
    // Login to the database
    await axios.post(`${process.env.BACKEND_URI}/client/auth/login`, {
        username: process.env.BACKEND_USER,
        password: process.env.BACKEND_PASSWORD
    })
        .then(async (response) => {
            console.log('logged in by token; ', response.data.data.token)
            axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.data.token}`;
        })
        .catch((error) => {
            console.log('error logging in by token; ', error)
        });

    switch (tag) {
        case 'itr':
            let jsonResponse = await axios.post(`${process.env.BACKEND_URI}/client/api/v1/resume/list`, {
                query: {
                    owner: userId
                },
            }).then(async (res) => {
                if (res.data.status === 'SUCCESS' && res.data.data.data[0].filename !== null) {
                    return {
                        session: request.body.sessionInfo.session,
                        sessionInfo:
                        {
                            parameters: {
                                thereIsResume: "true",
                                filename: `${res.data.data.data[0].filename}`
                            }
                        }
                    }
                } else {
                    return {
                        session: request.body.sessionInfo.session,
                        sessionInfo: {
                            parameters: {
                                thereIsResume: "false",
                                filename: "false"
                            }
                        }
                    }
                }
            })
                .catch((err) => {
                    console.log(err)
                })
            //await resumeJobs.add({ task: 'isThereResume', jsonResponse, userId });
            result = response.json(jsonResponse);
            break;
        case 'der':
            let derJsonResponse = await axios.post(`${process.env.BACKEND_URI}/client/api/v1/resume/list`, {
                query: {
                    owner: userId
                },
            }).then(async (res) => {
                if (res.data.status === 'SUCCESS' && res.data.data.data[0].filename !== null) {
                    return await axios.delete(`${process.env.BACKEND_URI}/client/api/v1/resume/delete/${res.data.data.data[0].id}`)
                        .then(async () => {
                            await resumeJobs.add({ task: 'delete', filePath: `${res.data.data.data[0].filename}` })
                            return {
                                session: request.body.sessionInfo.session,
                                sessionInfo: {
                                    parameters: {
                                        thereIsDeletedResume: "true",
                                        filename: "false"
                                    }
                                }
                            }
                        })
                } else {
                    return {
                        session: request.body.sessionInfo.session,
                        sessionInfo: {
                            parameters: {
                                thereIsDeletedResume: "true",
                                filename: "false"
                            }
                        }
                    }
                }
            })
            result = response.json(derJsonResponse);
            break;
        case 'cho':
            result = await axios.post(`${process.env.BACKEND_URI}/client/api/v1/opportunities/list`, {
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
                        const resume = await axios.post(`${process.env.BACKEND_URI}/client/api/v1/resume/list`, {
                            query: {
                                owner: userId
                            },
                        })
                            .catch((err) => {
                                console.log(err)
                            })
                        let userResume;
                        if (resume.data.status === 'SUCCESS' && resume.data.data.data.length) {
                            userResume = resume.data.data.data[0].filename;
                        }
                        // We didn't found a opportunity, let's search for an opportunity
                        hasOpportunity = false
                        await opportunityJobs.add('fillingOpportunities',
                            {
                                userId,
                                resume: userResume
                            }, {
                            priority: 1,
                            attempts: 3,
                            timeout: 60000
                        });
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
            break;
        case 'ifp':
            const resume = await axios.post(`${process.env.BACKEND_URI}/client/api/v1/resume/list`, {
                query: {
                    owner: userId
                }
            })
                .catch((err) => {
                    console.log(err)
                })

            let userResume;
            if (resume.data.status === 'SUCCESS' && resume.data.data.data.length) {
                userResume = resume.data.data.data[0].filename;
            }

            await resumeJobs.add({ task: 'isFilePresent', resume: userResume, userId }, { delay: 5000, attempts: 3 });
            result = response.json({
                session: request.body.sessionInfo.session
            })
            break;
        case 'ar':
            await opportunityJobs.add(
                'addingReferral',
                {
                    referredId: request.body.sessionInfo.parameters.checking_referral_url.split('/')[4],
                    userId
                },
                {
                    timeout: 60000 * 30
                });
            result = response.json({
                session: request.body.sessionInfo.session
            })
            break;
        case 'jobShortDescription':
        case 'jobRequirements':
        case 'jobResponsabilities':

            if (request.body.sessionInfo.parameters.jobId === undefined) {
                return response.json({
                    session: request.body.sessionInfo.session,
                });
            }

            result = await axios.get(`${process.env.BACKEND_URI}/client/api/v1/jobs/${request.body.sessionInfo.parameters.jobId}`)
                .then(async (res) => {
                    if (res.data.status === 'SUCCESS') {
                        // We found an opportunity
                        const jobData = res.data.data;
                        await opportunityJobs.add(
                            'jobInfo',
                            {
                                title: jobData.title,
                                description: jobData.description,
                                requirements: jobData.requirements,
                                responsabilities: jobData.responsabilities,
                                location: jobData.location,
                                userId,
                                tag
                            },
                            {
                                timeout: 60000
                            });
                    }
                    return response.json({
                        session: request.body.sessionInfo.session,
                    });
                })
                .catch((err) => {
                    console.log(err)
                });
            break;
    }
    return result;
}