#ifndef APPLICATION_H
#define APPLICATION_H

#include <qmainwindow.h>

class QToolBar;
class QToolBox;
class QToolButton;
class QWorkspace;
class QPopupMenu;
class LayerPanel;
class ProjectWindow;

class ApplicationWindow : public QMainWindow {
    Q_OBJECT
public:
    ApplicationWindow();
    ~ApplicationWindow();

protected:
    void closeEvent( QCloseEvent * );

private slots:
    ProjectWindow* newProj();
    void load();
    void save();
    void saveAs();
    void print();
    void closeWindow();
    void tileHorizontal();

    void cut();
    void copy();
    void paste();
	void del();
	void copyImageToFile();

	void addLayer();
	void addCosmeticLayer();
	void removeLayer();
	void layerManager();
	void zoomFull();
	void zoomIn();
	void zoomOut();
	void pan();
	void identify();
	void drawPoint();
	void drawLine();
	void drawCircle();
	void drawPolygon();

    void helpContents();
	void about();
    void aboutQt();

	void windowsMenuAboutToShow();
    void windowsMenuActivated( int id );
    void windowFocused();
    void changeVisibility( int, bool );
    void showShapeTools( bool flag );

private:
    QPrinter *printer;
    QWorkspace* ws;
    QToolBar *fileTools;
    QPopupMenu* windowsMenu;
    QToolBar *editTools;
	QToolBar *layerTools;
	QToolBar *toolsTools;
	QToolBar *whatsThisTools;
	QToolBar *shapesTools;
    LayerPanel *layerPanel;

	QToolButton *toolsZoomFull;
	QToolButton *toolsZoomIn;
	QToolButton *toolsZoomOut;
	QToolButton *toolsPan;
	QToolButton *toolsIdentify;

    QToolButton *shapesPoint;
    QToolButton *shapesLine;
    QToolButton *shapesCircle;
    QToolButton *shapesPolygon;
};


#endif
