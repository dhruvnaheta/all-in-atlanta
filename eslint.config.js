import globals from 'globals';
export default [{ignores:['node_modules/**','test-results/**','playwright-report/**']}, {
  files:['**/*.js'], languageOptions:{ecmaVersion:'latest', sourceType:'module', globals:{...globals.browser,...globals.node}},
  rules:{'no-undef':'error','no-unreachable':'error','no-dupe-keys':'error'}
}];
