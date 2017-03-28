import {index, get, create, update, enable, del} from '../src/controllers/links';
import sinon from 'sinon';

import {Schema} from 'jugglingdb';
import linkBuilder from '../src/models/Link';
import userBuilder from '../src/models/User';
import repositoryBuilder from '../src/models/Repository';
import assert from 'assert';

// Helper for mounting routes in an express app and querying them.
import issueRequest from './helpers/issueRequest';

describe('routes', () => {
  let schema,
      Link, User, Repository,
      userData, linkData, upstreamData, forkData;

  before(() => {
    schema = new Schema('memory');
    Repository = repositoryBuilder(schema);
    User = userBuilder(schema);
    Link = linkBuilder(schema);

    return Promise.all([
      User.create({
        username: 'my-user',
        email: 'foo@example.com',
        picture: 'http://example.com/foo.png',
        providerId: 1,
        accessToken: 'abcdef',
      }),
      Repository.create({ // Upstream
        type: 'repo',
        owner: 'foo',
        repo: 'bar',
        fork: false,
        html_url: 'https://github.com/foo/bar',
        branches: ['master'],
        branch: 'master',
      }),
      Repository.create({ // Fork
        type: 'repo',
        owner: 'foo',
        repo: 'bar',
        fork: false,
        html_url: 'https://github.com/foo/bar',
        branches: ['master'],
        branch: 'master',
      }),
    ]).then(([user, upstream, fork]) => {
      userData = user;
      upstreamData = upstream;
      forkData = fork;
      return Link.create({
        name: 'My Link',
        enabled: true,
        hookId: ['123456'],
        ownerId: user.id,
        upstreamId: upstream.id,
        forkId: fork.id,
      });
    }).then(link => {
      linkData = link;
    });
  });

  after(() => {
    schema = null;
  });

  it('should return all links for a user', () => {
    return issueRequest(
      index, [Link],
      '/', userData, {
        method: 'GET',
        url: '/',
        json: true,
      }
    ).then(res => {
      let body = res.body;
      assert.equal(body.data.length, 1);
      assert.equal(body.data[0].id, linkData.id);
      assert.equal(body.data[0].upstream.id, upstreamData.id);
      assert.equal(body.data[0].fork.id, forkData.id);
      assert.equal(body.data[0].owner.id, userData.id);
    });
  });

  it('should get a link for a user', () => {
    return issueRequest(
      get, [Link],
      '/:id', userData, {
        method: 'GET',
        url: `/${userData.id}`,
        json: true,
      }
    ).then(res => {
      let body = res.body;
      assert.equal(body.id, linkData.id);
      assert.equal(body.upstream.id, upstreamData.id);
      assert.equal(body.fork.id, forkData.id);
      assert.equal(body.owner.id, userData.id);
    });
  });
  it('should create a link for a user', () => {
    return issueRequest(
      create, [Link],
      '/', userData, {
        method: 'POST',
        url: '/',
        json: true,
      }
    ).then(res => {
      let body = res.body;
      assert.notEqual(body.id, linkData.id); // Make sure the id is something else.
      assert.equal(body.upstreamId, undefined);
      assert.equal(body.forkId, undefined);
      assert.equal(body.ownerId, userData.id);

      return Link.findOne({where: {id: body.id}});
    }).then(link => {
      assert.equal(link.enabled, false);
    });
  });

  it('should update a link for a user', () => {
    const addWebhooksForLink = sinon.stub().resolves(['98765']);
    const removeOldWebhooksForLink = sinon.stub().resolves();

    return issueRequest(
      update, [Link, Repository, addWebhooksForLink, removeOldWebhooksForLink],
      '/:linkId', userData, {
        method: 'PUT',
        url: `/${linkData.id}`,
        json: true,
        body: {
          link: {
            name: 'Another name for my link!',
            upstream: upstreamData.id,
            fork: forkData.id,
          },
        },
      }
    ).then(res => {
      let body = res.body;
      assert.equal(body.id, linkData.id);
      assert.equal(body.upstreamId, upstreamData.id);
      assert.equal(body.forkId, forkData.id);
      assert.equal(body.forkId, forkData.id);
      assert.equal(body.name, 'Another name for my link!');

      return Link.findOne({where: {id: linkData.id}});
    }).then(link => {
      assert.equal(link.name, 'Another name for my link!');
    });
  });
  it('should update a link with a new upstream', () => {
    const addWebhooksForLink = sinon.stub().resolves(['98765']);
    const removeOldWebhooksForLink = sinon.stub().resolves();

    // First, remove the upstream id from the link to test against.
    return linkData.updateAttribute('upstreamId', null).then(() => {
      return issueRequest(
        update, [Link, Repository, addWebhooksForLink, removeOldWebhooksForLink],
        '/:linkId', userData, {
          method: 'PUT',
          url: `/${linkData.id}`,
          json: true,
          body: {
            link: {
              name: 'Another name for my link!',
              upstream: {
                type: 'repo',
                owner: 'foo',
                repo: 'bar',
                branches: ['master'],
                branch: 'master',
              },
              fork: forkData.id,
            },
          },
        }
      );
    }).then(res => {
      let body = res.body;
      assert.equal(body.id, linkData.id);
      assert.equal(body.forkId, forkData.id);
      assert.equal(body.name, 'Another name for my link!');

      return Link.findOne({where: {id: linkData.id}});
    }).then(link => {
      assert.equal(link.name, 'Another name for my link!');
      assert.notEqual(link.upstreamId, upstreamData.id); // Make sure a new upstream was created
    });
  });

  it('should enable a link for a user', () => {
    const enabledState = !linkData.enabled;
    return issueRequest(
      enable, [Link],
      '/:linkId', userData, {
        method: 'PUT',
        url: `/${linkData.id}`,
        json: true,
        body: {
          enabled: enabledState,
        },
      }
    ).then(res => {
      assert.equal(res.statusCode, 200);
      return Link.findOne({where: {id: linkData.id}});
    }).then(link => {
      assert.equal(link.enabled, enabledState);
    })
  });
  it('should delete a link for a user', () => {
    const enabledState = !linkData.enabled;
    return issueRequest(
      del, [Link],
      '/:id', userData, {
        method: 'DELETE',
        url: `/${linkData.id}`,
        json: true,
      }
    ).then(res => {
      assert.equal(res.statusCode, 204);
      return Link.findOne({where: {id: linkData.id}});
    }).then(link => {
      assert.equal(link, null); // Link no longer exists.
    });
  });
});
