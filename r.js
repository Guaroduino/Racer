
const TYPES = ['unsigned\\\\s+long', 'int'].join('|');
try {
  let re = new RegExp(\(?:\\\\bconst\\\\s+)?\\\\b(?:\)\\\\s+(\\\\w+)\\\\s*\\\\[([^\\\\]]*)\\\\]\\\\s*=\\\\s*\\\\{([\\\\s\\\\S]*?)\\\\}\\\\s*;\, 'g');
  console.log('REGEX OK', re);
} catch (e) {
  console.log('REGEX FAILED', e);
}

