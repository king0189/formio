'use strict';

const prompt = require('prompt');
const async = require('async');
const fs = require('fs-extra');
const _ = require('lodash');
const nunjucks = require('nunjucks');
nunjucks.configure([], {watch: false});
const util = require('./src/util/util');
const debug = require('debug')('formio:error');
const path = require('path');
const rootUser = "lingxiao.jin@everbridge.com";
const rootPwd = "123456";

module.exports = function(formio, items, done) {
  // The project that was created.
  let project = {};

  // The directory for the client application.
  const directories = {
    client: path.join(__dirname, 'client'),
    app: path.join(__dirname, 'app')
  };

  // The application they wish to install.
  let application = '';
  let templateFile = '';

  /**
   * Download a zip file.
   *
   * @param url
   * @param zipFile
   * @param dir
   * @param done
   * @returns {*}
   */
  const download = function(url, zipFile, dir, done) {
    // Check to see if the client already exists.
    if (fs.existsSync(zipFile)) {
      util.log(`${directories[dir]} file already exists, skipping download.`);
      return done();
    }

    const request = require('request');
    const ProgressBar = require('progress');
    util.log(`Downloading ${dir}${'...'.green}`);

    // Download the project.
    let downloadError = null;
    let tries = 0;
    let bar = null;
    (function downloadProject() {
      request.get(url)
          .on('response', function(res) {
            if (
                !res.headers.hasOwnProperty('content-disposition') ||
                !parseInt(res.headers['content-length'], 10)
            ) {
              if (tries++ > 3) {
                return done('Unable to download project. Please try again.');
              }

              setTimeout(downloadProject, 200);
              return;
            }

            // Setup the progress bar.
            bar = new ProgressBar('  downloading [:bar] :percent :etas', {
              complete: '=',
              incomplete: ' ',
              width: 50,
              total: parseInt(res.headers['content-length'], 10)
            });

            res.pipe(fs.createWriteStream(zipFile, {
              flags: 'w'
            }));
            res.on('data', function(chunk) {
              if (bar) {
                bar.tick(chunk.length);
              }
            });
            res.on('error', function(err) {
              downloadError = err;
            });
            res.on('end', function() {
              setTimeout(function() {
                done(downloadError);
              }, 100);
            });
          });
    })();
  };

  /**
   * Extract a download to a folder.
   *
   * @param zipFile
   * @param fromDir
   * @param dir
   * @param done
   * @returns {*}
   */
  const extract = function(zipFile, fromDir, dir, done) {
    // See if we need to extract.
    if (fs.existsSync(directories[dir])) {
      util.log(`${directories[dir]} already exists, skipping extraction.`);
      return done();
    }

    // Unzip the contents.
    const AdmZip = require('adm-zip');
    util.log('Extracting contents...'.green);
    const zip = new AdmZip(zipFile);
    zip.extractAllTo('', true);
    fs.move(fromDir, directories[dir], function(err) {
      if (err) {
        return done(err);
      }

      // Delete the zip file.
      fs.remove(zipFile);

      // Get the package json file.
      let info = {};
      try {
        info = JSON.parse(fs.readFileSync(path.join(directories[dir], 'package.json')));
      }
      catch (err) {
        debug(err);
        return done(err);
      }

      // Set local variable to directory path.
      let directoryPath = directories[dir];

      // Change the document root if we need to.
      if (info.formio && info.formio.docRoot) {
        directoryPath = path.join(directories[dir], info.formio.docRoot);
      }

      if (!fs.existsSync(path.join(directoryPath, 'config.template.js'))) {
        return done('Missing config.template.js file');
      }

      // Change the project configuration.
      const config = fs.readFileSync(path.join(directoryPath, 'config.template.js'));
      const newConfig = nunjucks.renderString(config.toString(), {
        domain: formio.config.domain ? formio.config.domain : 'https://form.io'
      });
      fs.writeFileSync(path.join(directoryPath, 'config.js'), newConfig);
      done();
    });
  };

  // All the steps in the installation.
  const steps = {
    /**
     * Step to perform the are you sure step.
     *
     * @param done
     */
    // areYouSure: function(done) {
    //   if (process.env.ROOT_EMAIL) {
    //     done();
    //   }
    //   prompt.get([
    //     {
    //       name: 'install',
    //       description: 'Are you sure you wish to install? (y/N)',
    //       required: true
    //     }
    //   ], function(err, results) {
    //     if (err) {
    //       return done(err);
    //     }
    //     if (results.install.toLowerCase() !== 'y') {
    //       return done('Installation canceled.');
    //     }
    //
    //     done();
    //   });
    // },

    // Allow them to select the application.
    whatApp: function(done) {
      util.log('start whatApp...');
      if (process.env.ROOT_EMAIL) {
        done();
      }
      const repos = [
        'None',
        'https://github.com/formio/formio-app-humanresources',
        'https://github.com/formio/formio-app-servicetracker',
        'https://github.com/formio/formio-app-todo',
        'https://github.com/formio/formio-app-salesquote',
        'https://github.com/formio/formio-app-basic'
      ];
      application = repos[5];
      application = application.replace('https://github.com/', '');
      util.log('whatApp done');
      done();
    },

    /**
     * Download the application.
     *
     * @param done
     * @returns {*}
     */
    downloadApp: function(done) {
      util.log('downloadApp start');
      if (!application) {
        util.log('downloadApp done 1');
        return done();
      }

      // Download the app.
      download(
          `https://codeload.github.com/${application}/zip/master`,
          'app.zip',
          'app',
          done
      );
    },

    /**
     * Extract the application to the app folder.
     *
     * @param done
     * @returns {*}
     */
    extractApp: function(done) {
      util.log('extractApp start');
      if (!application) {
        util.log('extractApp done 1');
        return done();
      }

      const parts = application.split('/');
      const appDir = `${parts[1]}-master`;
      extract('app.zip', appDir, 'app', done);
    },

    /**
     * Download the Form.io admin client.
     *
     * @param done
     * @returns {*}
     */
    downloadClient: function(done) {
      util.log('downloadClient start');
      if (!items.download) {
        util.log('downloadClient done 1');
        return done();
      }

      // Download the client.
      download(
          'https://codeload.github.com/formio/formio-app-formio/zip/master',
          'client.zip',
          'client',
          done
      );
    },

    /**
     * Extract the client.
     *
     * @param done
     * @returns {*}
     */
    extractClient: function(done) {
      util.log('extractClient start');
      if (!items.extract) {
        util.log('extractClient done 1');
        return done();
      }

      extract('client.zip', 'formio-app-formio-master', 'client', done);
    },

    /**
     * Select the template to use.
     *
     * @param done
     * @return {*}
     */
    whatTemplate: function(done) {
      util.log('whatTemplate start');
      if (application) {
        templateFile = 'app';
        util.log('whatTemplate done 1');
        return done();
      }
      if (process.env.ROOT_EMAIL) {
        templateFile = 'client';
        util.log('whatTemplate done 2');
        done();
      }

      // let message = '\nWhich project template would you like to install?\n'.green;
      // message += '\n   Please provide the local file path of the project.json file.'.yellow;
      // message += '\n   Or, just press '.yellow + 'ENTER'.green + ' to use the default template.\n'.yellow;
      // util.log(message);
      templateFile = 'client';
      done();
    },

    /**
     * Import the template.
     * @param done
     */
    importTemplate: function(done) {
      util.log('importTemplate start');
      if (!items.import) {
        util.log('importTemplate done 1');
        return done();
      }

      // Determine if this is a custom project.
      // const customProject = (['app', 'client'].indexOf(templateFile) === -1);
      // let directoryPath = '';
      //
      // if (!customProject) {
      //   directoryPath = directories[templateFile];
      //   // Get the package json file.
      //   let info = {};
      //   try {
      //     info = JSON.parse(fs.readFileSync(path.join(directoryPath, 'package.json')));
      //   }
      //   catch (err) {
      //     debug(err);
      //     return done(err);
      //   }
      //
      //   // Change the document root if we need to.
      //   if (info.formio && info.formio.docRoot) {
      //     directoryPath = path.join(directoryPath, info.formio.docRoot);
      //   }
      // }
      //
      // const projectJson = customProject ? templateFile : path.join(directoryPath, 'project.json');
      // if (!fs.existsSync(projectJson)) {
      //   util.log(projectJson);
      //   return done('Missing project.json file'.red);
      // }
      //
      // let template = {};
      // try {
      //   template = JSON.parse(fs.readFileSync(projectJson));
      // }
      // catch (err) {
      //   debug(err);
      //   return done(err);
      // }
      //
      // // Get the form.io service.
      // util.log('Importing template...'.green);
      // const importer = require('./src/templates/import')({formio: formio});
      // importer.template(template, function(err, template) {
      //   if (err) {
      //     return done(err);
      //   }
      //
      //   project = template;
      //   util.log('importTemplate done 2');
      //   done(null, template);
      // });
      let template = {};
      const projectJson = "{  \"title\": \"Form Manager\",  \"name\": \"form-manager\",  \"version\": \"2.0.0\",  \"description\": \"Provides a usable Form Management system.\",  \"preview\": {    \"url\": \"https://formio.github.io/formio-app-formio/dist\",    \"repo\": \"https://github.com/formio/formio-app-formio\"  },  \"roles\": {    \"administrator\": {      \"title\": \"Administrator\",      \"description\": \"A role for Administrative Users.\",      \"admin\": true,      \"machineName\": \"administrator\"    },    \"authenticated\": {      \"title\": \"Authenticated\",      \"description\": \"A role for Authenticated Users.\"    },    \"anonymous\": {      \"title\": \"Anonymous\",      \"description\": \"A role for Anonymous Users.\",      \"default\": true    }  },  \"resources\": {    \"user\": {      \"title\": \"User\",      \"type\": \"resource\",      \"name\": \"user\",      \"path\": \"user\",      \"submissionAccess\": [        {          \"type\": \"create_all\",          \"roles\": [            \"administrator\"          ]        },        {          \"type\": \"read_all\",          \"roles\": [            \"administrator\"          ]        },        {          \"type\": \"update_all\",          \"roles\": [            \"administrator\"          ]        },        {          \"type\": \"delete_all\",          \"roles\": [            \"administrator\"          ]        },        {          \"type\": \"create_own\",          \"roles\": []        },        {          \"type\": \"read_own\",          \"roles\": []        },        {          \"type\": \"update_own\",          \"roles\": []        },        {          \"type\": \"delete_own\",          \"roles\": []        }      ],      \"access\": [        {          \"type\": \"read_all\",          \"roles\": [            \"anonymous\",            \"authenticated\",            \"administrator\"          ]        }      ],      \"components\": [        {          \"type\": \"email\",          \"persistent\": true,          \"unique\": false,          \"protected\": false,          \"defaultValue\": \"\",          \"suffix\": \"\",          \"prefix\": \"\",          \"placeholder\": \"Enter your email address\",          \"key\": \"email\",          \"label\": \"Email\",          \"inputType\": \"email\",          \"tableView\": true,          \"input\": true        },        {          \"type\": \"password\",          \"persistent\": true,          \"protected\": true,          \"suffix\": \"\",          \"prefix\": \"\",          \"placeholder\": \"Enter your password.\",          \"key\": \"password\",          \"label\": \"Password\",          \"inputType\": \"password\",          \"tableView\": false,          \"input\": true        },        {          \"type\": \"button\",          \"theme\": \"primary\",          \"disableOnInvalid\": true,          \"action\": \"submit\",          \"block\": false,          \"rightIcon\": \"\",          \"leftIcon\": \"\",          \"size\": \"md\",          \"key\": \"submit\",          \"tableView\": false,          \"label\": \"Submit\",          \"input\": true        }      ]    },    \"admin\": {      \"title\": \"Admin\",      \"type\": \"resource\",      \"name\": \"admin\",      \"path\": \"admin\",      \"submissionAccess\": [        {          \"type\": \"create_all\",          \"roles\": [            \"administrator\"          ]        },        {          \"type\": \"read_all\",          \"roles\": [            \"administrator\"          ]        },        {          \"type\": \"update_all\",          \"roles\": [            \"administrator\"          ]        },        {          \"type\": \"delete_all\",          \"roles\": [            \"administrator\"          ]        },        {          \"type\": \"create_own\",          \"roles\": []        },        {          \"type\": \"read_own\",          \"roles\": []        },        {          \"type\": \"update_own\",          \"roles\": []        },        {          \"type\": \"delete_own\",          \"roles\": []        }      ],      \"access\": [        {          \"type\": \"read_all\",          \"roles\": [            \"anonymous\",            \"authenticated\",            \"administrator\"          ]        }      ],      \"components\": [        {          \"type\": \"email\",          \"persistent\": true,          \"unique\": false,          \"protected\": false,          \"defaultValue\": \"\",          \"suffix\": \"\",          \"prefix\": \"\",          \"placeholder\": \"Enter your email address\",          \"key\": \"email\",          \"label\": \"Email\",          \"inputType\": \"email\",          \"tableView\": true,          \"input\": true        },        {          \"type\": \"password\",          \"persistent\": true,          \"protected\": true,          \"suffix\": \"\",          \"prefix\": \"\",          \"placeholder\": \"Enter your password.\",          \"key\": \"password\",          \"label\": \"Password\",          \"inputType\": \"password\",          \"tableView\": false,          \"input\": true        },        {          \"type\": \"button\",          \"theme\": \"primary\",          \"disableOnInvalid\": true,          \"action\": \"submit\",          \"block\": false,          \"rightIcon\": \"\",          \"leftIcon\": \"\",          \"size\": \"md\",          \"key\": \"submit\",          \"tableView\": false,          \"label\": \"Submit\",          \"input\": true        }      ]    }  },  \"forms\": {    \"userLogin\": {      \"title\": \"User Login\",      \"type\": \"form\",      \"name\": \"userLogin\",      \"path\": \"user/login\",      \"access\": [        {          \"type\": \"read_all\",          \"roles\": [            \"anonymous\"          ]        }      ],      \"submissionAccess\": [        {          \"type\": \"create_own\",          \"roles\": [            \"anonymous\"          ]        }      ],      \"components\": [        {          \"type\": \"email\",          \"persistent\": true,          \"unique\": false,          \"protected\": false,          \"defaultValue\": \"\",          \"suffix\": \"\",          \"prefix\": \"\",          \"placeholder\": \"Enter your email address\",          \"key\": \"email\",          \"lockKey\": true,          \"label\": \"Email\",          \"inputType\": \"email\",          \"tableView\": true,          \"input\": true        },        {          \"type\": \"password\",          \"persistent\": true,          \"protected\": true,          \"suffix\": \"\",          \"prefix\": \"\",          \"placeholder\": \"Enter your password.\",          \"key\": \"password\",          \"lockKey\": true,          \"label\": \"Password\",          \"inputType\": \"password\",          \"tableView\": false,          \"input\": true        },        {          \"type\": \"button\",          \"theme\": \"primary\",          \"disableOnInvalid\": true,          \"action\": \"submit\",          \"block\": false,          \"rightIcon\": \"\",          \"leftIcon\": \"\",          \"size\": \"md\",          \"key\": \"submit\",          \"tableView\": false,          \"label\": \"Submit\",          \"input\": true        }      ]    },    \"userRegister\": {      \"title\": \"User Register\",      \"name\": \"userRegister\",      \"path\": \"user/register\",      \"type\": \"form\",      \"access\": [        {          \"type\": \"read_all\",          \"roles\": [            \"anonymous\"          ]        }      ],      \"submissionAccess\": [        {          \"type\": \"create_own\",          \"roles\": [            \"anonymous\"          ]        }      ],      \"components\": [        {          \"type\": \"email\",          \"persistent\": true,          \"unique\": false,          \"protected\": false,          \"defaultValue\": \"\",          \"suffix\": \"\",          \"prefix\": \"\",          \"placeholder\": \"Enter your email address\",          \"key\": \"email\",          \"lockKey\": true,          \"label\": \"Email\",          \"inputType\": \"email\",          \"tableView\": true,          \"input\": true        },        {          \"type\": \"password\",          \"persistent\": true,          \"protected\": true,          \"suffix\": \"\",          \"prefix\": \"\",          \"placeholder\": \"Enter your password.\",          \"key\": \"password\",          \"lockKey\": true,          \"label\": \"Password\",          \"inputType\": \"password\",          \"tableView\": false,          \"input\": true        },        {          \"theme\": \"primary\",          \"disableOnInvalid\": true,          \"action\": \"submit\",          \"block\": false,          \"rightIcon\": \"\",          \"leftIcon\": \"\",          \"size\": \"md\",          \"key\": \"submit\",          \"label\": \"Submit\",          \"input\": true,          \"type\": \"button\"        }      ]    }  },  \"actions\": {    \"userSave\": {      \"title\": \"Save Submission\",      \"name\": \"save\",      \"form\": \"user\",      \"handler\": [        \"before\"      ],      \"method\": [        \"create\",        \"update\"      ],      \"priority\": 11,      \"settings\": {}    },    \"adminSave\": {      \"title\": \"Save Submission\",      \"name\": \"save\",      \"form\": \"admin\",      \"handler\": [        \"before\"      ],      \"method\": [        \"create\",        \"update\"      ],      \"priority\": 11,      \"settings\": {}    },    \"userLogin\": {      \"name\": \"login\",      \"title\": \"Login\",      \"form\": \"userLogin\",      \"priority\": 2,      \"method\": [        \"create\"      ],      \"handler\": [        \"before\"      ],      \"settings\": {        \"resources\": [          \"user\",          \"admin\"        ],        \"username\": \"email\",        \"password\": \"password\"      }    },    \"userRegisterSave\": {      \"title\": \"Save Submission\",      \"name\": \"save\",      \"form\": \"userRegister\",      \"handler\": [        \"before\"      ],      \"method\": [        \"create\"      ],      \"priority\": 10,      \"settings\": {        \"resource\": \"user\",        \"fields\": {          \"email\": \"email\",          \"password\": \"password\"        }      }    },    \"userRegisterLogin\": {      \"name\": \"login\",      \"title\": \"Login\",      \"form\": \"userRegister\",      \"priority\": 2,      \"method\": [        \"create\"      ],      \"handler\": [        \"before\"      ],      \"settings\": {        \"resources\": [          \"user\"        ],        \"username\": \"email\",        \"password\": \"password\"      }    },    \"authenticatedRole\": {      \"name\": \"role\",      \"title\": \"Role Assignment\",      \"form\": \"user\",      \"priority\": 1,      \"handler\": [        \"after\"      ],      \"method\": [        \"create\"      ],      \"settings\": {        \"role\": \"authenticated\",        \"type\": \"add\",        \"association\": \"new\"      }    },    \"adminRole\": {      \"name\": \"role\",      \"title\": \"Role Assignment\",      \"form\": \"admin\",      \"priority\": 1,      \"handler\": [        \"after\"      ],      \"method\": [        \"create\"      ],      \"settings\": {        \"role\": \"administrator\",        \"type\": \"add\",        \"association\": \"new\"      }    }  }}";
      const importer = require('./src/templates/import')({formio: formio});
      try {
        template = JSON.parse(projectJson);
      } catch (err) {
        debug(err);
        return done(err);
      }
      importer.template(template, function(err, template) {
        if (err) {
          return done(err);
        }

        project = template;
        util.log('importTemplate done 2');
        done(null, template);
      });
    },

    /**
     * Create the root user object.
     *
     * @param done
     */
    createRootUser: function(done) {
      util.log('createRootUser start');
      if (process.env.ROOT_EMAIL) {
        prompt.override = {
          email: process.env.ROOT_EMAIL,
          password: process.env.ROOT_PASSWORD
        };
      }
      if (!items.user) {
        util.log('createRootUser done 1');
        return done();
      }
      util.log('Creating root user account...'.green);
      util.log('Encrypting password');
      formio.encrypt(rootPwd, function(err, hash) {
        if (err) {
          return done(err);
        }

        // Create the root user submission.
        util.log('Creating root user account');
        formio.resources.submission.model.create({
          form: project.resources.admin._id,
          data: {
            email: rootUser,
            password: hash
          },
          roles: [
            project.roles.administrator._id
          ]
        }, function(err, item) {
          if (err) {
            return done(err);
          }
          util.log('createRootUser done 2');
          done();
        });
      });
      // prompt.get([
      //   {
      //     name: 'email',
      //     description: 'Enter your email address for the root account.',
      //     pattern: /^[a-zA-Z0-9.!#$%&’*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/,
      //     message: 'Must be a valid email',
      //     required: true
      //   },
      //   {
      //     name: 'password',
      //     description: 'Enter your password for the root account.',
      //     require: true,
      //     hidden: true
      //   }
      // ], function(err, result) {
      //   if (err) {
      //     return done(err);
      //   }
      //
      //   util.log('Encrypting password');
      //   formio.encrypt(result.password, function(err, hash) {
      //     if (err) {
      //       return done(err);
      //     }
      //
      //     // Create the root user submission.
      //     util.log('Creating root user account');
      //     formio.resources.submission.model.create({
      //       form: project.resources.admin._id,
      //       data: {
      //         email: result.email,
      //         password: hash
      //       },
      //       roles: [
      //         project.roles.administrator._id
      //       ]
      //     }, function(err, item) {
      //       if (err) {
      //         return done(err);
      //       }
      //
      //       done();
      //     });
      //   });
      // });
    }
  };

  util.log('Installing...');
  prompt.start();
  async.series([
    // steps.areYouSure,
    //  steps.whatApp,
    //  steps.downloadApp,
    // steps.extractApp,
    //steps.downloadClient,
    //steps.extractClient,
    steps.whatTemplate,
    steps.importTemplate,
    steps.createRootUser
  ], function(err, result) {
    if (err) {
      util.log(err);
      return done(err);
    }

    util.log('Install successful!'.green);
    done();
  });
};
