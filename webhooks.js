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
        // if (res.data.status === 'SUCCESS' && res.data.data.data[0].filename) {
        //     return {
        //         queryParams: { parameters: struct.encode({
        //             thereIsResume: true,
        //             filename: `${res.data.data.data[0].filename}`
        //         }) }
        //     }
        // } else {
        //     return {
        //         queryParams: { parameters: struct.encode({
        //             thereIsResume: false,
        //             filename: "false"
        //         }) }
        //     }
        // }
        if (res.data.status === 'SUCCESS' && res.data.data.data[0].filename !== null) {
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
                        resume: "",
                        filename: "false"
                    }
                }
            }
        }
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
                    const resume = await axios.post(`${process.env.BACKEND_URI}/client/api/v1/resume/list`, {
                        query: {
                            id: userId
                        },
                    }) 

                    let userResume;
                    if(resume.data.status === 'SUCCESS' && resume.data.data.data.length){
                        userResume = resume.data.data.data[0].filename;
                    }
                    // We didn't found a opportunity, let's search for an opportunity
                    hasOpportunity = false
                    await opportunityJobs.add(
                        {
                            userId,
                            resume: request.body.sessionInfo.parameters?.resume || request.body.sessionInfo.parameters?.filename || userResume
                        }, {
                        attempts: 5,
                        timeout: 5000
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
        userId = parserSession[parserSession.length - 1]
    // cleans all jobs that completed over 5 seconds ago.
    await resumeJobs.clean(5000);
    // clean all jobs that failed over 10 seconds ago.
    await resumeJobs.clean(5000, 'failed');

    const resume = await axios.post(`${process.env.BACKEND_URI}/client/api/v1/resume/list`, {
        query: {
            id: userId
        },
    })

    let userResume;
    if (resume.data.status === 'SUCCESS' && resume.data.data.data.length) {
        userResume = resume.data.data.data[0].filename;
    }

    await resumeJobs.add({ task: 'isFilePresent', resume: request.body.sessionInfo.parameters.resume || request.body.sessionInfo.parameters.filename || userResume, userId }, { delay: 10000 });
    return response.json({
        session: request.body.sessionInfo.session
    })

}
exports.fillingTheFormPage1 = async (request, response) => {
    let parserSession = request.body.sessionInfo.session.split('/'),
        userId = parserSession[parserSession.length - 1]
    // cleans all jobs that completed over 5 seconds ago.
    await resumeJobs.clean(5000);
    // clean all jobs that failed over 10 seconds ago.
    await resumeJobs.clean(5000, 'failed');

    await opportunityJobs.add(
        'fillingTheFormPage1',
        {
            firstName: request.body.sessionInfo.parameters.firstName,
            lastName: request.body.sessionInfo.parameters.lastName,
            email: request.body.sessionInfo.parameters.email,
            linkedin: request.body.sessionInfo.parameters.linkedin,
            phone: request.body.sessionInfo.parameters.phone,
            skype: request.body.sessionInfo.parameters.skype,
            resume: request.body.sessionInfo.parameters.resume || request.body.sessionInfo.parameters.filename,
            userId
        });
    return response.json({
        session: request.body.sessionInfo.session
    })
}
exports.fillingTheFormPage2 = async (request, response) => {
    let parserSession = request.body.sessionInfo.session.split('/'),
        userId = parserSession[parserSession.length - 1]
    // cleans all jobs that completed over 5 seconds ago.
    await resumeJobs.clean(5000);
    // clean all jobs that failed over 10 seconds ago.
    await resumeJobs.clean(5000, 'failed');
    console.log('request', request.body)
    await opportunityJobs.add(
        'fillingTheFormPage2',
        {
            years_of_experience: request.body.sessionInfo.parameters.years_of_experience,
            level_of_english: request.body.sessionInfo.parameters.level_of_english,
            filename: request.body.sessionInfo.parameters.filename,
            salary_expectation: request.body.sessionInfo.parameters.salary_expectation,
            ready_for_remote: request.body.sessionInfo.parameters.ready_for_remote,
            city: request.body.sessionInfo.parameters.city,
            skills: request.body.sessionInfo.parameters.skills,
            country: request.body.sessionInfo.parameters.country,
            specialization: request.body.sessionInfo.parameters.specialization,
            userId
        });
    return response.json({
        session: request.body.sessionInfo.session
    })
}