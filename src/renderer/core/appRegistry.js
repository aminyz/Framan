export function createAppRegistry() {
  const apps = [];

  return {
    register(appDefinition) {
      apps.push(appDefinition);
    },
    list() {
      return [...apps].sort((a, b) => a.order - b.order);
    },
    get(id) {
      return apps.find((app) => app.id === id);
    }
  };
}
