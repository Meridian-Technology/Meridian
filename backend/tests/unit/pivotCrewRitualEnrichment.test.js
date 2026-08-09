const mongoose = require('mongoose');
const {
  serializeRitualSwipeMember,
} = require('../../services/pivotCrewRitualEnrichment');

describe('pivotCrewRitualEnrichment', () => {
  it('marks invited placeholders as not swiped', () => {
    const member = serializeRitualSwipeMember(
      {
        _id: new mongoose.Types.ObjectId(),
        status: 'invited',
        role: 'member',
        userId: null,
      },
      new Map(),
      new Set(),
    );

    expect(member).toEqual({
      userId: null,
      displayLabel: 'invited',
      picture: null,
      status: 'invited',
      role: 'member',
      swiped: false,
    });
  });

  it('marks active members swiped when they have intents', () => {
    const userId = new mongoose.Types.ObjectId();
    const member = serializeRitualSwipeMember(
      {
        _id: new mongoose.Types.ObjectId(),
        status: 'active',
        role: 'owner',
        userId,
      },
      new Map([[userId.toString(), { name: 'Alex', picture: 'pic.jpg' }]]),
      new Set([userId.toString()]),
    );

    expect(member).toMatchObject({
      userId: userId.toString(),
      displayLabel: 'Alex',
      picture: 'pic.jpg',
      status: 'active',
      role: 'owner',
      swiped: true,
    });
  });
});
