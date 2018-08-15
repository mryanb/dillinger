
'use strict';

module.exports =
  angular
  .module('plugins.gitlab', [
    'plugins.gitlab.service',
    'plugins.gitlab.modal'
  ])
  .controller('Gitlab', function($rootScope, $modal, gitlabService, documentsService, diNotify, userService) {

  var vm = this;

  vm.importFile          = importFile;
  vm.saveTo              = saveTo;
  vm.updateSHAOnDocument = updateSHAOnDocument;
  vm.chooseScope         = chooseScope;

  //////////////////////////////

  function importFile(username) {

    var modalInstance = $modal.open({
      template: require('raw!./gitlab-modal.directive.html'),
      controller: 'GitlabModal as modal',
      windowClass: 'modal--dillinger',
      resolve: {
        items: function() {
          gitlabService.config.user.name = username;
          return gitlabService.fetchGroups().then(gitlabService.registerUserAsOrg);
        }
      }
    });

    return modalInstance.result.then(function() {
      var file = documentsService.createItem({
        isGithubFile: true,
        body:         gitlabService.config.current.file,
        title:        gitlabService.config.current.fileName,
        gitlab: {
          originalFileName:    gitlabService.config.current.fileName,
          originalFileContent: gitlabService.config.current.file,
          sha:                 gitlabService.config.current.sha,
          branch:              gitlabService.config.current.branch,
          owner:               gitlabService.config.current.owner,
          repo:                gitlabService.config.current.repo,
          url:                 gitlabService.config.current.url,
          path:                gitlabService.config.current.path
        }
      });

      documentsService.addItem(file);
      documentsService.setCurrentDocument(file);

      gitlabService.save();
      $rootScope.$emit('document.refresh');
      return $rootScope.$emit('autosave');
    });
  }

  function updateSHAOnDocument(result) {
    documentsService.setCurrentDocumentSHA(result.data.content.sha);
    $rootScope.$emit('document.refresh');
    return $rootScope.$emit('autosave');
  }

  function saveTo(username) {
    var file = documentsService.getCurrentDocument();

    // Document must be an imported file from Github to work.
    if (file.isGithubFile) {

       prepareGithubCommit(function(githubCommitMessage) {
        var filePath = file.github.path.substr(0,file.github.path.lastIndexOf('/'));
        var postData = {
          body:    file.body,
          path:    filePath ? filePath + '/' + file.title : file.title,
          sha:     file.github.sha,
          branch:  file.github.branch,
          repo:    file.github.repo,
          owner:   file.github.owner,
          uri:     file.github.url,
          message: githubCommitMessage
        };

        return gitlabService.saveToGithub(postData).then(
          function successCallback(result) {
            vm.updateSHAOnDocument(result)
          }, function errorCallback(err){
          return diNotify({
            message: 'An Error occured: ' + err.error,
            duration: 5000
          });

            });

      }, file); // end prepareGithubCommit
    } else {
      return diNotify({
        message: 'Your Document must be an imported file from Gitlab.'
      });
    } // end else
  } // end saveTo()

  function chooseScope() {
    var modalInstance = $modal.open({
      template: require('raw!./gitlab-modal.scope.html'),
      controller: function($scope, $modalInstance){
        $scope.close = function () {
          $modalInstance.dismiss('cancel');
        };
      },
      windowClass: 'modal--dillinger scope',
    });
  };

  function prepareGithubCommit(callback, file) {

    var modalInstance = $modal.open({
      template: require('raw!./gitlab-commit-message-modal.html'),
      controller: function($scope, $modalInstance) {
        $scope.close = function() {
          $modalInstance.dismiss('cancel');
        };
        $scope.commit = function() {
          var commitMessage = $scope.commitMessage || 'Saved ' + file.title + ' with Dillinger.io';
          if ($scope.skipCI)
            commitMessage = commitMessage + " [skip ci]";
          callback(commitMessage);
          $scope.close();
        };
        if (! userService.profile.enableGitHubComment)
          $scope.commit();
      },
      windowClass: 'modal--dillinger scope',
    });

    if (! userService.profile.enableGitHubComment)
        modalInstance.opened.then(function() { modalInstance.close()});
  };

});
