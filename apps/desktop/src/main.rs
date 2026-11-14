use gpui::{
    App, Application, Bounds, Context, KeyBinding, Menu, MenuItem, TitlebarOptions, Window,
    WindowBounds, WindowOptions, actions, div, prelude::*, px, rgb, size,
};

mod updater;

actions!(mdit, [Quit]);

struct Mdit {
    updater_error: Option<String>,
}

impl Render for Mdit {
    fn render(&mut self, _window: &mut Window, _cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .size_full()
            .flex()
            .flex_col()
            .items_center()
            .justify_center()
            .gap_2()
            .bg(rgb(0x18181b))
            .text_color(rgb(0xf4f4f5))
            .child(div().text_3xl().child("Mdit"))
            .child(
                div()
                    .text_sm()
                    .text_color(rgb(0xa1a1aa))
                    .child("A fresh start."),
            )
            .children(self.updater_error.clone())
    }
}

fn main() {
    Application::new().run(|cx: &mut App| {
        cx.on_action(|_: &Quit, cx| cx.quit());
        cx.bind_keys([KeyBinding::new("cmd-q", Quit, None)]);
        let mut menu_items = Vec::new();
        let updater_error = match updater::init(cx) {
            Ok(Some(item)) => {
                menu_items.extend([item, MenuItem::separator()]);
                None
            }
            Ok(None) => None,
            Err(error) => Some(error),
        };
        menu_items.push(MenuItem::action("Quit Mdit", Quit));
        cx.set_menus(vec![Menu {
            name: "Mdit".into(),
            items: menu_items,
        }]);
        cx.on_window_closed(|cx| {
            if cx.windows().is_empty() {
                cx.quit();
            }
        })
        .detach();

        let bounds = Bounds::centered(None, size(px(1000.0), px(700.0)), cx);
        cx.open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(bounds)),
                window_min_size: Some(size(px(480.0), px(320.0))),
                titlebar: Some(TitlebarOptions {
                    title: Some("Mdit".into()),
                    ..Default::default()
                }),
                ..Default::default()
            },
            |_, cx| cx.new(|_| Mdit { updater_error }),
        )
        .expect("failed to open the Mdit window");
        cx.activate(true);
    });
}
