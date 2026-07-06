jest.mock('../../services/getModelService', () => jest.fn());
jest.mock('axios', () => ({ post: jest.fn() }));

const NotificationService = require('../../services/notificationService');

describe('notificationService pivot friend navigation', () => {
  const service = new NotificationService();

  const friendRequestNotification = {
    _id: 'notif-1',
    type: 'system',
    template: {
      name: 'friend_request',
      variables: {
        friendshipId: 'friendship-123',
        sender: 'user-456',
      },
    },
    metadata: {
      navigation: {
        type: 'navigate',
        route: 'MainTabs',
        params: {
          screen: 'Friends',
          params: {initialTab: 'requests'},
        },
        deepLink: 'meridian://friends/requests',
      },
      friendshipId: 'friendship-123',
    },
  };

  it('keeps campus navigation for campus push recipients', () => {
    const navigation = service.buildNavigationInstructions(friendRequestNotification, {
      pushAppEdition: 'campus',
    });

    expect(navigation.route).toBe('MainTabs');
    expect(navigation.deepLink).toBe('meridian://friends/requests');
  });

  it('routes pivot recipients to PivotFriendRequests', () => {
    const navigation = service.buildNavigationInstructions(friendRequestNotification, {
      pushAppEdition: 'pivot',
    });

    expect(navigation).toEqual({
      type: 'navigate',
      route: 'PivotFriendRequests',
      params: {},
      deepLink: 'meridian://pivot/friends/requests',
    });
  });

  it('routes pivot friend_accepted notifications to PivotFriends', () => {
    const navigation = service.buildNavigationInstructions(
      {
        type: 'system',
        template: {name: 'friend_accepted', variables: {}},
        metadata: {
          navigation: {
            type: 'navigate',
            route: 'MainTabs',
            params: {screen: 'Friends'},
            deepLink: 'meridian://friends',
          },
        },
      },
      {pushAppEdition: 'pivot'},
    );

    expect(navigation.route).toBe('PivotFriends');
    expect(navigation.deepLink).toBe('meridian://pivot/friends');
  });
});
