# vue-app-navigation

Navigation library for Vue for web apps that need to feel and work like native apps (inspired by iOS)

## Installation

### Yarn

```
yarn add @simonbackx/vue-app-navigation
```

### NPM

```
npm install @simonbackx/vue-app-navigation
```

[Example](https://simonbackx.com/files/vue-app-navigation/example.gif "Example of navigation")

## Concepts

-   URL based navigation isn't fit for mobile applications. You should be able to keep pushing new views, and you should be able to navigate back to earlier states without having to keep in mind how to rebuild the state of earlier components. It just needs to 'work'.
-   By allowing views to navivate to other views as they please, you don't need one place where you specify all your possible routes. The possibilities are endless. You can keep on pushing views on your navigation controller.
-   Your app should always scroll on the document, never on a different element - expect in popups or during transitions. This makes sure the toolbars disappear and appear properly in mobile browsers.
-   When you display a view modally, it will take over the document scroll position. The outgoing view will disappear from the DOM with a temporary scroll position to allow a good animation.
-   You can move components around like the vue <keep-alive> component, but better. Without having to keep it in one place. This allowed us to build a splitview controller that propertly handles screen rotation.
-   Display fixed elements with sticky. You can also use 'fixed', but that won't work if you use popups.

The class `ComponentWithProperties` is a temporary container that manages some things for you. You can use it to pass arround a component with properties (without having to render it). You can display it using the `ComponentWithPropertiesInstance` component. As soon as you display it somewhere, it will keep track of its component instance. If you want to move the component to a different place in the DOM, you can set `keepAlive` to true just before you remove the component instance from the DOM. This will use the same underlying system as the <keep-alive> component to make sure the component instance is not destroyed. With the same reference to your `ComponentWithProperties` instance you can show it again in a different `ComponentWithPropertiesInstance` component while maintaining the state of the component instance you displayed earlier. `keepAlive` will automatically jump back to false again as it will detect that you've shown the component again.

`ComponentWithProperties` has a debug counter to show and log the amount of component instances that are still in memory.

Normally, you don't need to use `ComponentWithPropertiesInstance` directly, since this library also provides the components your need for building your app navigation: NavigationController & SplitViewController.

# Todo

-   Allow some way to have URL's redirect to a specific hierarchy of components (± comparable with how universtal links work in native apps)
-   Add complete documentation
