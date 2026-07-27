module.exports = {
  ci: {
    collect: {
      staticDistDir: './dist',
      url: ['http://localhost/'],
      numberOfRuns: 3,
      settings: {
        onlyCategories: ['performance', 'accessibility', 'seo'],
      },
    },
    assert: {
      assertions: {
        'categories:accessibility': ['error', { minScore: 1 }],
        'categories:seo': ['error', { minScore: 0.95 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'total-blocking-time': ['error', { maxNumericValue: 200 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-byte-weight': ['error', { maxNumericValue: 3 * 1024 * 1024 }],
      },
    },
    upload: { target: 'filesystem', outputDir: './.lighthouseci' },
  },
}
