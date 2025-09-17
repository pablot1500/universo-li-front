export const calculatePrice = (components, laborCost, margin) => {
  // 'components' is an array of objects with 'price' and 'quantity' properties
  const sumComponents = components.reduce((total, comp) => total + (comp.price * comp.quantity), 0);
  const costWithLabor = sumComponents + laborCost;
  return costWithLabor * (1 + margin);
};
