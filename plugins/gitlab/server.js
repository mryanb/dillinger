var express = require('express')
  , app = module.exports = express()
  , Gitlab = require('./gitlab.js').Gitlab
  , request = require('request')
  , qs = require('querystring')
  , fs = require('fs')
  , path = require('path')

/* Gitlab stuff */

var oauth_gitlab_redirect = function(req, res) {
  // Create GitHub session object and stash for later.
  var uri;
  req.session.gitlab = {};
  if (Gitlab.gitlabConfig.access_token !== undefined) {
    req.session.gitlab.oauth = Gitlab.gitlabConfig.access_token;
    req.session.isGitlabSynced = true;
    console.log('/')
    Gitlab.getUsername(req, res,function() {
      res.redirect('/')
    });
  } else {
    req.session.gitlab.access_token = null
    uri = Gitlab.generateAuthUrl(req)
    res.redirect(uri)
  }
}

var oauth_gitlab = function(req, res, cb) {
  if (!req.query.code) {
    cb();
  } else {
    var code = req.query.code
      , client_id = Gitlab.gitlabConfig.client_id
      , redirect_uri = Gitlab.gitlabConfig.redirect_uri
      , client_secret = Gitlab.gitlabConfig.client_secret

    // parameters = 'client_id=APP_ID&client_secret=APP_SECRET&code=RETURNED_CODE&grant_type=authorization_code&redirect_uri=REDIRECT_URI'
    var params = '?client_id=' + client_id
                  + '&client_secret=' + client_secret
                  + '&code=' + code
                  + '&grant_type=authorization_code'
                  + '&redirect_uri=' + redirect_uri + '/oauth/gitlab'

    var uri = Gitlab.gitlabConfig.gitlab_url + '/oauth/token'+params

    console.log('Getting acess token');
    console.log(uri);

    request.post(uri, function(err, resp, body) {
      // TODO: MAKE THIS MORE GRACEFUL
      if (err) res.send(err.message)
      else {
        // access_token=519e3f859210aa34265a52acb6b88290087f8996&scope=repo&token_type=bearer
        if (!req.session.gitlab) {
          req.session.gitlab = {
            access_token: null
          }
        }
        console.log(body);
        req.session.gitlab.access_token = (JSON.parse(body)).access_token
        req.session.gitlab.scope = (JSON.parse(body)).scope
        req.session.isGitlabSynced = true
        console.log('about')
        Gitlab.getUsername(req, res,function() {
          res.redirect('/')
        })

      }
    })

  } // end else
}

var unlink_gitlab = function(req, res) {
  // Essentially remove the session for dropbox...
  delete req.session.gitlab
  req.session.isGitlabSynced = false
  res.redirect('/')
}

var import_gitlab_groups = function(req, res) {

  Gitlab.fetchGroups(req, res)

}

var import_gitlab_repos = function(req, res) {

  Gitlab.fetchRepos(req, res)

}

var import_gitlab_branches = function(req, res) {

  Gitlab.fetchBranches(req, res)

}

var import_tree_files = function(req, res) {

  Gitlab.fetchTreeFiles(req, res)

}

var import_gitlab_file = function(req, res) {

  Gitlab.fetchFile(req, res)

}

var save_gitlab = function(req, res) {

  Gitlab.saveToGitlab(req, res)

}

/* End Gitlab stuff */

/* Begin Gitlab */

app.get('/redirect/gitlab', oauth_gitlab_redirect);

app.get('/oauth/gitlab', oauth_gitlab);

app.get('/unlink/gitlab', unlink_gitlab);

// app.get('/account/gitlab', account_info_gitlab)

app.post('/import/gitlab/groups', import_gitlab_groups);

app.post('/import/gitlab/repos', import_gitlab_repos);

app.post('/import/gitlab/branches', import_gitlab_branches);

app.post('/import/gitlab/tree_files', import_tree_files);

app.post('/import/gitlab/file', import_gitlab_file);

app.post('/save/gitlab', save_gitlab);

app.get('/js/gitlab.js', function(req, res) {
  console.log(path.join(__dirname, 'client.js'));
  fs.readFile(path.join(__dirname, 'client.js'), 'utf8', function(err, data) {
    if (err) {
      res.send(500, "Sorry couldn't read file")
    }
    else {
      res.setHeader('content-type', 'text/javascript');
      res.send(200, data)
    }
  })
})

/* End Gitlab */
