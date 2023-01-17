const axios = require('axios');
const { struct } = require('pb-util');
const Queue = require('bull');
const resumeJobs = new Queue('resumeJobs', `redis://${process.env.REDIS_URI}:6379`);
const opportunityJobs = new Queue('opportunityJobs', `redis://${process.env.REDIS_URI}:6379`);

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
    // .then(() => {
    //     resumeJobs.add({ task: 'message', userId, userSaid, userName, filePath: `${this.filename}` });
    // })

    return response.json(jsonResponse);
}
exports.checkOpportunities = async (request, response) => {

    let parserSession = request.body.sessionInfo.session.split('/'),
        userId = parserSession[parserSession.length - 1],
        hasOpportunity

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
                        attempts: 1,
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
    } catch (e) {
        console.log(`checkOpportunities; ${e.message}... `);
    }
}
exports.isfilePresent = async (request, response) => {
    let parserSession = request.body.sessionInfo.session.split('/'),
        userId = parserSession[parserSession.length - 1];

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
    return response.json({
        session: request.body.sessionInfo.session
    })

}
exports.addingReferral = async (request, response) => {
    let parserSession = request.body.sessionInfo.session.split('/'),
        userId = parserSession[parserSession.length - 1]
    // cleans all jobs that completed over 5 seconds ago.
    await resumeJobs.clean(5000);
    // clean all jobs that failed over 10 seconds ago.
    await resumeJobs.clean(5000, 'failed');

    await opportunityJobs.add(
        'addingReferral',
        {
            referredId: request.body.sessionInfo.parameters.checking_referral_url.split('/')[4],
            userId
        },
        {
            timeout: 60000 * 30
        });
    return response.json({
        session: request.body.sessionInfo.session
    })
}
exports.updateJobInfo = async (request, response) => {

    let parserSession = request.body.sessionInfo.session.split('/'),
        userId = parserSession[parserSession.length - 1]

    try {

        if (request.body.sessionInfo.parameters.jobId === undefined){
            return response.json({
                session: request.body.sessionInfo.session,
            });
        }
        let tag = request.body.fulfillmentInfo.tag;
        
        return axios.get(`${process.env.BACKEND_URI}/client/api/v1/jobs/${request.body.sessionInfo.parameters.jobId}`)
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
    } catch (e) {
        console.log(`updateJobInfo; ${e.message}... `);
    }
}