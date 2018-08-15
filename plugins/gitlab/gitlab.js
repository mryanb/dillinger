var fs = require('fs')
  , path = require('path')
  , request = require('request')
  , url = require('url')
  , parse = require('parse-link-header')

var gitlabConfigFile = path.resolve(__dirname, '../../configs/gitlab/', 'gitlab-config.json')
  , gitlabConfig = {}
  , isConfigEnabled = false

// ^^^helps with the home page view; should we show the github dropdown?

if (fs.existsSync(gitlabConfigFile)) {
  gitlabConfig = require(gitlabConfigFile);
  isConfigEnabled = true;
} else if (process.env.github_client_id !== undefined) {
  gitlabConfig = {
    "client_id": process.env.github_client_id,
    "redirect_uri": process.env.github_redirect_uri,
    "client_secret": process.env.github_client_secret,
    "callback_url": process.env.github_callback_url
  };
  isConfigEnabled = true;
  console.log('Gitlab config found in environment. Plugin enabled. (Key: "' + gitlabConfig.client_id +'")');
} else if (process.env.github_access_token !== undefined) {
  gitlabConfig = {
    "access_token": process.env.github_access_token
  };
  isConfigEnabled = true;
  console.log('Gitlab config found in environment. Plugin enabled using a personal access_token.');
} else {
  gitlabConfig = {
    "client_id": "YOUR_ID"
  , "redirect_uri": "http://dillinger.io/"
  , "client_secret": "YOUR_SECRET"
  , "callback_url": "http://dillinger.io/oauth/gitlab"
  }
  console.warn('Gitlab config not found at ' + gitlabConfigFile + '. Plugin disabled.')
}

function arrayToRegExp(arr) {
  return new RegExp("(" + arr.map(function(e) { return e.replace('.','\\.'); }).join('|') + ")$", 'i');
}

exports.Gitlab = (function() {

  var headers = {
      "User-Agent": "X-Dillinger-App"
    }

  // String builder for auth url...
  function _buildAuthUrl(response_type) {
    // https://gitlab.example.com/oauth/authorize?client_id=APP_ID&redirect_uri=REDIRECT_URI&response_type=code&state=YOUR_UNIQUE_STATE_HASH
    return  gitlabConfig.gitlab_url + '/oauth/authorize?client_id='
            + gitlabConfig.client_id
            + '&response_type=' + response_type + '&redirect_uri='
            + gitlabConfig.callback_url
  }

  return {
    isConfigured: isConfigEnabled,
    gitlabConfig: gitlabConfig,
    generateAuthUrl: function(req, res) {
      var request_type = 'code' // Default request_type.
      // @TODO - Are there other types of requests for gitlab?
      // if(req.query.request_type === 'repo') {
      //   request_type = 'repo';
      // }

      console.log(_buildAuthUrl(request_type));

      return _buildAuthUrl(request_type)

    },
    getUsername: function(req, res, cb) {

        console.log(req.session);

      var uri = gitlabConfig.gitlab_url + '/api/v4/user?access_token=' + req.session.gitlab.access_token

      console.log(uri);

      var options = {
        headers: headers
      , uri: uri
      }

      console.log('getting username from gitlab')

      request(options, function(e, r, d) {
        if (e) {
          console.error(e)
          return res.redirect(r.statusCode)
        }
        else if (!e && r.statusCode === 200) {
          d = JSON.parse(d)
          req.session.gitlab.username = d.username
          console.log(d.username);
          cb && cb()
        }
      }) // end request.get()

    }, // end getUsername
    fetchGroups: function(req, res) {
      var uri;
      // @TODO - are there different API scopes?
      if(req.session.gitlab.scope == 'repo') {
        // If private access given, then can list all organization memberships.
        // https://developer.github.com/v3/orgs/#list-your-organizations
        uri = gitlabConfig.gitlab_url + 'user/orgs?access_token=' + req.session.gitlab.oauth
      } else {
        // can only list public organization memberships.
        // https://developer.github.com/v3/orgs/#list-user-organizations
        uri = gitlabConfig.gitlab_url + 'users/' + req.session.gitlab.username + '/orgs?access_token=' + req.session.gitlab.access_token
      }

      // @TODO - This should be the users groups only, is owned correct?
      uri = gitlabConfig.gitlab_url + '/api/v4/groups?owned=1&access_token=' + req.session.gitlab.access_token

      var options = {
        headers: headers
      , uri: uri
      }

      request(options, function(e, r, d) {
        if (e) {
          res.send({
            error: 'Request error.',
            data: r.statusCode
          })
        }
        else if (!e && r.statusCode == 200) {
          var set = []

          d = JSON.parse(d)

          d.forEach(function(el) {

            // Build the group item for display
            var item = {
              url: el.web_url
            , name: el.name
            }

            set.push(item)
          })

          res.json(set)

        } // end else if
        else {
          res.json({ error: 'Unable to fetch groups from Gitlab.' })
        }
      }) // end request callback

    }, // end fetchOrgs

    fetchRepos: function(req, res) {

      var uri;

      // @TODO - Will repos/projects get pulled by group?
      // if (req.body.owner !== req.session.gitlab.username) {
      //   uri = gitlabConfig.gitlab_url + 'orgs/' + req.body.owner + '/repos?access_token=' + req.session.gitlab.oauth
      // }
      // else {
      //   uri = gitlabConfig.gitlab_url + 'user/repos?access_token=' + req.session.gitlab.oauth
      // }

      // @TODO - This is actually fetching projects
      uri = gitlabConfig.gitlab_url + '/api/v4/projects?membership=1&access_token=' + req.session.gitlab.access_token

      if (isFinite(req.body.page) && +req.body.page > 1) {
        uri += "&page=" + req.body.page
      }

      if (isFinite(req.body.per_page) && +req.body.per_page > 1) {
        uri += "&per_page=" + req.body.per_page
      }

      uri += "&type=owner"

      var options = {
        headers: headers
      , uri: uri
      }

      request(options, function(e, r, d) {
        if (e) {
          res.send({
            error: 'Request error.',
            data: r.statusCode
          })
        }
        else if (!e && r.statusCode == 200) {
          var set = []

          d = JSON.parse(d)

          d.forEach(function(el) {

            var item = {
              url: el.web_url
            , name: el.name
            , path_with_namespace: el.path_with_namespace
            , private: el.private
            // future property we will need to pass so we can know whether we can "write" to repo
            //, permissions: el.permissions
            }

            set.push(item)
          })

          res.json({
            items: set,
            pagination: parse(r.headers['link'])
          });

        } // end else if
        else {
          res.json({ error: 'Unable to fetch repos from Github.' })
        }
      }) // end request callback
    }, // end fetchRepos
    fetchBranches: function(req, res) {
      // GET /projects/:id/repository/branches
      // https://gitlab.example.com/api/v4/projects/5/repository/branches
      var uri = gitlabConfig.gitlab_url
        + '/api/v4/projects/'
        + encodeURIComponent(req.body.project_path_namespace)
        + '/repository/branches?access_token=' + req.session.gitlab.access_token

      var options = {
        headers: headers
      , uri: uri
      }

      request(options, function(e, r, d) {
        if (e) {
          res.send({
            error: 'Request error.'
          , d: r.statusCode
          })
        }
        else if (!e && r.statusCode === 200) {
          res.send(d)
        } // end else if
        else {
          res.json({ error: 'Unable to fetch branches from Gitlab.' })
        }
      }) // end request callback

    }, // end fetchBranches
    fetchTreeFiles: function(req, res) {
      // /projects/:id/repository/tree

      var uri, options, fileExts, regExp

      uri = gitlabConfig.gitlab_url
        + '/api/v4/projects/'
        + encodeURIComponent(req.body.repo)
        + '/repository/tree?recursive=1'
        + '&ref=' + req.body.branch
        +'&access_token=' + req.session.gitlab.access_token

      options = {
        headers: headers
      , uri: uri
      };
      fileExts = req.body.fileExts.split("|");
      regExp = arrayToRegExp(fileExts);

      request(options, function(e, r, d) {

        if (e) {
          res.send({
            error: 'Request error.'
          , data: r.statusCode
          })
        }
        else if (!e && r.statusCode === 200) {
          d = JSON.parse(d)
          // d.branch = req.body.branch // inject branch info

          // overwrite results to only return items that match regexp
          d = d.filter(function(item) { return regExp.test(item.path) });

          res.json(d)
        } // end else if
        else {
          res.json({ error: 'Unable to fetch files from Gitlab.' })
        }
      }) // end request callback

    }, // end fetchTreeFiles
    fetchFile: function(req, res) {
        console.log(req.body);
      // /projects/:id/repository/files/:file_path
      var uri = gitlabConfig.gitlab_url
        + '/api/v4/projects/'
        + encodeURIComponent(req.body.repo)
        + '/repository/files/'
        + encodeURIComponent(req.body.path)
        + '?ref=' + req.body.branch
        +'&access_token=' + req.session.gitlab.access_token

      var options = {
        headers: headers
      , uri: uri
      }
      request(options, function(e, r, d) {
        if (e) {
          console.error(e)

          res.send({
            error: 'Request error.'
          , data: r.statusCode
          })
        }
        else if (!e && r.statusCode === 200) {
          var jsonResp = {
            data: JSON.parse(d),
            error: false
          }

          d = JSON.parse(d)
          jsonResp.data.content = (new Buffer(d.content, 'base64').toString('utf-8'))

          res.json(jsonResp)

        } // end else if
        else {
          res.json({ error: 'Unable to fetch file from Gitlab.' })
        }
      }) // end request callback

    }, // end fetchFile

    saveToGithub: function(req, res) {
      var data = req.body
      if (!data.uri) {
        res.json(400, { "error": "Requires Github URI" })
      }
      else {
        // uri = "https://api.github.com/repos/:owner/:repo/contents/:path"
        var
          commit, options, uri, owner,
          repo,   branch,  sha, message,
          isPrivateRepo;

        isPrivateRepo = /blob/.test(data.uri);

        branch  = data.branch;
        path    = data.path;
        sha     = data.sha;
        repo    = data.repo;
        owner   = data.owner;
        message = data.message;

        uri = gitlabConfig.gitlab_url + "repos/" + owner + '/' + repo + '/contents/' + path;
        uri += '?access_token=' + req.session.gitlab.oauth;

        commit = {
          message: message // Better commit messages?
        , path: path
        , branch: branch
        , content: new Buffer(data.data).toString('base64')
        , sha: sha
      };

        options = {
          headers: headers
        , uri: uri
        , method: "PUT"
        , body: JSON.stringify(commit)
        }

        request(options, function(e, r, d) {
          // 200 = Updated
          // 201 = Created
          // 409 = Conflict
          var data
          try{
            data = JSON.parse(d)
          }catch(e){
            return res.status(400).json({ "error": "Unable to save file: " + (e || data.message) })
          }
          // In case the sha doesn't match...
          if (!e && r.statusCode === 409) {
            return res.status(409).json({ "error": "Unable to save file: " + (e || data.message) })
          }

          if (!e && r.statusCode === 200 || r.statusCode === 201) {
            return res.status(200).json(data)
          }

        }) // end request()

      }
    }
  }

})()
