#include "application.h"
#include "layerpanel.h"
#include "projectwindow.h"
#include "sminfo.h"
#include "smabout.h"
#include <qworkspace.h>
#include <qpixmap.h>
#include <qtoolbar.h>
#include <qtoolbutton.h>
#include <qpopupmenu.h>
#include <qmenubar.h>
#include <qfiledialog.h>
#include <qstatusbar.h>
#include <qmessagebox.h>
#include <qprinter.h>
#include <qapplication.h>
#include <qaccel.h>
#include <qwhatsthis.h>
#include <qobjectlist.h>
#include <qvbox.h>
#include <qbuttongroup.h>

const char * fileNewText = "Click this button to open a new <em><b>SmartMap</b> project file</em>. <br><br>"
							"You can also select the <b>New Project command</b> from the File menu.";
const char * fileOpenText = "Click this button to open a <em><b>SmartMap</b> project file</em>. <br><br>"
							"You can also select the <b>Open Project... command</b> from the File menu.";
const char * fileSaveText = "Click this button to save the SmartMap Project you are "
							"editing.  You will be prompted for a file name.\n\n"
							"You can also select the Save command from the File menu.";
const char * filePrintText = "Click this button to print the Map Image you "
							 "are editing.\n\n"
							 "You can also select the Print command from the File menu.";

ApplicationWindow::ApplicationWindow() : QMainWindow( 0, "SmartMap main window", WDestructiveClose ) {
    int id;

    QPixmap newIcon, openIcon, saveIcon, printIcon;
	QPixmap cutIcon, copyIcon, pasteIcon, delIcon;
	QPixmap addLayerIcon, removeLayerIcon, cLayerIcon;
	QPixmap zoomFullIcon, zoomInIcon, zoomOutIcon, panIcon, identifyIcon;
	QPixmap pointIcon, lineIcon, circleIcon, polygonIcon;

	// add pix, make them visible on menus...
	newIcon			= QPixmap( "images/filenew.png" );
	openIcon 		= QPixmap( "images/fileopen.png" );
	saveIcon 		= QPixmap( "images/filesave.png" );
	printIcon 		= QPixmap( "images/fileprint.png" );
	cutIcon		 	= QPixmap( "images/editcut.png" );
	copyIcon	 	= QPixmap( "images/editcopy.png" );
	pasteIcon	 	= QPixmap( "images/editpaste.png" );
	delIcon		 	= QPixmap( "images/editdelete.png" );
	addLayerIcon 	= QPixmap( "images/addlayer.png" );
	removeLayerIcon = QPixmap( "images/removelayer.png" );
	cLayerIcon	 	= QPixmap( "images/cosmetic.png" );
	zoomFullIcon 	= QPixmap( "images/toolszoomfull.png" );
	zoomInIcon   	= QPixmap( "images/toolszoomin.png" );
	zoomOutIcon  	= QPixmap( "images/toolszoomout.png" );
	panIcon		 	= QPixmap( "images/toolspan.png" );
	identifyIcon 	= QPixmap( "images/toolsidentify.png" );
	pointIcon		= QPixmap( "images/point.png" );
	lineIcon		= QPixmap( "images/line.png" );
	circleIcon		= QPixmap( "images/circle.png" );
	polygonIcon		= QPixmap( "images/polygon.png" );

    // File ToolBar
	fileTools = new QToolBar( this, "file toolbar" );
    addToolBar( fileTools, tr( "File" ), DockTop, false );

    QToolButton * fileNew  = new QToolButton( newIcon, "New Project", QString::null,
			   								  this, SLOT(newProj()), fileTools, "new project" );
    QToolButton * fileOpen = new QToolButton( openIcon, "Open Project", QString::null,
			   								  this, SLOT(load()), fileTools, "open project" );
    QToolButton * fileSave = new QToolButton( saveIcon, "Save Project", QString::null,
			   								  this, SLOT(save()), fileTools, "save project" );

#ifndef QT_NO_PRINTER
	printer = new QPrinter( QPrinter::HighResolution );

    QToolButton * filePrint	= new QToolButton( printIcon, "Print Image", QString::null,
			   								   this, SLOT(print()), fileTools, "print image" );
    QWhatsThis::add( filePrint, filePrintText );
#endif

	// Edit ToolBar
	editTools = new QToolBar( this, "edit toolbar" );
	addToolBar( editTools, tr( "Edit" ), DockTop, false );

	QToolButton * editCut = new QToolButton( cutIcon, "Cut", QString::null,
											  this, SLOT(cut()), editTools, "cut" );
	QToolButton * editCopy = new QToolButton( copyIcon, "Copy", QString::null,
											  this, SLOT(copy()), editTools, "Copy" );
	QToolButton * editPaste = new QToolButton( pasteIcon, "Paste", QString::null,
											  this, SLOT(paste()), editTools, "Paste" );
	QToolButton * editDel = new QToolButton( delIcon, "Delete", QString::null,
											  this, SLOT(del()), editTools, "Paste" );

	// Layer ToolBar
	layerTools = new QToolBar( this, "layer toolbar" );
	addToolBar( layerTools, tr( "Layer" ), DockTop, false );

	QToolButton * layerAdd = new QToolButton( addLayerIcon, "Add Layer", QString::null,
											  this, SLOT(addLayer()), layerTools, "Add Layer" );
	QToolButton * layerRemove = new QToolButton( removeLayerIcon, "Remove Layer", QString::null,
											  this, SLOT(removeLayer()), layerTools, "Remove Layer" );
	QToolButton * layerAddCosmetic = new QToolButton( cLayerIcon, "New Cosmetic Layer", QString::null,
											  this, SLOT(addCosmeticLayer()), layerTools, "Add Cosmetic Layer" );

	// Tools ToolBar
	toolsTools = new QToolBar( this, "tools toolbar" );
	addToolBar( toolsTools, tr( "Tools" ), DockTop, false );

	toolsZoomFull = new QToolButton( zoomFullIcon, "Zoom Full Extent", QString::null,
											  this, SLOT(zoomFull()), toolsTools, "Zoom Full Extent" );
	toolsZoomIn = new QToolButton( zoomInIcon, "Zoom In", QString::null,
											  this, SLOT(zoomIn()), toolsTools, "Zoom In" );
	toolsZoomIn->setToggleButton ( true );

	toolsZoomOut = new QToolButton( zoomOutIcon, "Zoom Out", QString::null,
											  this, SLOT(zoomOut()), toolsTools, "Zoom Out" );
	toolsZoomOut->setToggleButton ( true );

	toolsPan = new QToolButton( panIcon, "Pan", QString::null,
											  this, SLOT(pan()), toolsTools, "Pan" );
	toolsPan->setToggleButton ( true );

	toolsIdentify = new QToolButton( identifyIcon, "Identify", QString::null,
											  this, SLOT(identify()), toolsTools, "Identify" );
	toolsIdentify->setToggleButton ( true );

	// WhatsThis ToolBar
	whatsThisTools = new QToolBar( this, "whatsthis toolbar" );
	addToolBar( whatsThisTools, tr( "Whats This" ), DockTop, false );
	(void)QWhatsThis::whatsThisButton( whatsThisTools );

	QWhatsThis::add( fileNew, fileNewText );
	QWhatsThis::add( fileOpen, fileOpenText );
	QWhatsThis::add( fileSave, fileSaveText );

	// Shapes ToolBar
	shapesTools = new QToolBar( this, "shapes toolbar" );
	addToolBar( shapesTools, tr( "Shapes" ), DockTornOff, false );
	shapesTools->move( this->size().width() , 100 );
	setDockEnabled( shapesTools, DockTop, false );
	setDockEnabled( shapesTools, DockBottom, false );
	setDockEnabled( shapesTools, DockLeft, false );
	setDockEnabled( shapesTools, DockRight, false );
	shapesTools->hide();

	shapesPoint  = new QToolButton( pointIcon, "Point", QString::null,
												  this, SLOT(drawPoint()), shapesTools, "point" );
	shapesPoint->setToggleButton ( true );

	shapesLine  = new QToolButton( lineIcon, "Line", QString::null,
												  this, SLOT(drawLine()), shapesTools, "line" );
	shapesLine->setToggleButton ( true );

	shapesCircle  = new QToolButton( circleIcon, "Circle", QString::null,
											  this, SLOT(drawCircle()), shapesTools, "circle" );
	shapesCircle->setToggleButton ( true );

	shapesPolygon  = new QToolButton( polygonIcon, "Polygon", QString::null,
											  this, SLOT(drawPolygon()), shapesTools, "polygon" );
	shapesPolygon->setToggleButton ( true );

	// Menu definitions
    QPopupMenu * file = new QPopupMenu( this );
	menuBar()->insertItem( "&File", file );

	id = file->insertItem( newIcon, "&New Project", this, SLOT( newProj() ), CTRL+Key_N );
	file->setWhatsThis( id, fileNewText );

	id = file->insertItem( openIcon, "&Open Project...", this, SLOT( load() ), CTRL+Key_O );
	file->setWhatsThis( id, fileOpenText );

	id = file->insertItem( saveIcon, "&Save Project", this, SLOT( save() ), CTRL+Key_S );
	file->setWhatsThis( id, fileSaveText );

	id = file->insertItem( "Save &As...", this, SLOT( saveAs() ) );
	file->setWhatsThis( id, fileSaveText );

	file->insertSeparator();
	file->insertItem( "&Close Project", this, SLOT( closeWindow() ), CTRL+Key_W );

#ifndef QT_NO_PRINTER
	file->insertSeparator();
	id = file->insertItem( printIcon, "&Print Image...",
			   this, SLOT(print()), CTRL+Key_P );
	file->setWhatsThis( id, filePrintText );
#endif
	file->insertSeparator();

	file->insertItem( "E&xit", qApp, SLOT( closeAllWindows() ) );

	QPopupMenu * edit = new QPopupMenu( this );
	menuBar()->insertItem( "&Edit", edit );
	edit->insertItem( cutIcon, "Cut", this, SLOT(cut()), CTRL+Key_X );
	edit->insertItem( copyIcon, "Copy", this, SLOT(copy()), CTRL+Key_C );
	edit->insertItem( pasteIcon, "Paste", this, SLOT(paste()), CTRL+Key_V );
	edit->insertItem( delIcon, "Delete", this, SLOT(del()), Key_Delete );
	edit->insertSeparator();
	edit->insertItem( "Copy Map Image to File...", this, SLOT(copyImageToFile()) );

	QPopupMenu * layer = new QPopupMenu( this );
	menuBar()->insertItem( "&Layer", layer );
	layer->insertItem( addLayerIcon, "&Add Layer...", this, SLOT(addLayer()) );
	layer->insertItem( removeLayerIcon, "&Remove Layer", this, SLOT(removeLayer()) );
	layer->insertSeparator();
	layer->insertItem( cLayerIcon, "&New Cosmetic Layer...", this, SLOT(addCosmeticLayer()) );
	layer->insertItem( "&Open Existing Cosmetic Layer...", this, SLOT(addCosmeticLayer()) );
	layer->insertSeparator();
	layer->insertItem( "&Layer Manager...", this, SLOT(layerManager()) );

	QPopupMenu * tools = new QPopupMenu( this );
	menuBar()->insertItem( "&Tools", tools );
	tools->insertItem( zoomFullIcon, "Zoom Full Extent", this, SLOT(zoomFull()), Key_Asterisk );
	tools->insertSeparator();
	tools->insertItem( zoomInIcon, "Zoom In", this, SLOT(zoomIn()), Key_Plus );
	tools->insertItem( zoomOutIcon, "Zoom Out", this, SLOT(zoomOut()), Key_Minus );
	tools->insertItem( panIcon, "Pan", this, SLOT(pan()) );
	tools->insertItem( identifyIcon, "Identify", this, SLOT(identify()) );

	windowsMenu = new QPopupMenu( this );
	windowsMenu->setCheckable( TRUE );
	connect( windowsMenu, SIGNAL( aboutToShow() ), this, SLOT( windowsMenuAboutToShow() ) );
	menuBar()->insertItem( "&Windows", windowsMenu );

    menuBar()->insertSeparator();

	QPopupMenu * help = new QPopupMenu( this );
	menuBar()->insertItem( "&Help", help );

	help->insertItem( "Help Contents", this, SLOT(helpContents()), Key_F1);
	help->insertSeparator();
	help->insertItem( QPixmap("images/smartmap.png"), "&About SmartMap", this, SLOT(about()));
	help->insertItem( "About &Qt", this, SLOT(aboutQt()));
	help->insertSeparator();
    help->insertItem( "What's &This", this, SLOT(whatsThis()), SHIFT+Key_F1);

	// Application startup configurations
    QVBox* vb = new QVBox( this );
    vb->setFrameStyle( QFrame::StyledPanel | QFrame::Sunken );
    ws = new QWorkspace( vb );
    ws->setScrollBarsEnabled( TRUE );
    setCentralWidget( vb );

    setIcon( QPixmap("images/smartmap.gif") );
    statusBar()->setSizeGripEnabled( true );
    statusBar()->message( "Ready", 2000 );
    QFont font = statusBar()->font();
    font.setBold( true );
    statusBar()->setFont( font );

    help->setItemEnabled(help->idAt(0), false);
	edit->setItemEnabled(edit->idAt(0), false);
	edit->setItemEnabled(edit->idAt(1), false);
	edit->setItemEnabled(edit->idAt(2), false);
	edit->setItemEnabled(edit->idAt(3), false);

	// add LayerPanel to the application
	layerPanel = new LayerPanel( QDockWindow::InDock, this );
	addDockWindow( layerPanel, DockLeft );
	setDockEnabled( layerPanel, DockTop, false );
	setDockEnabled( layerPanel, DockBottom, false );
	setDockMenuEnabled( false );
	layerPanel->setMovingEnabled( false );
}

ApplicationWindow::~ApplicationWindow() {
#ifndef QT_NO_PRINTER
    delete printer;
#endif
}

ProjectWindow*
ApplicationWindow::newProj() {
    ProjectWindow* w = new ProjectWindow( ws, 0, WDestructiveClose );
    //connect( w, SIGNAL( message(const QString&, int) ), statusBar(), SLOT( message(const QString&, int )) );
    connect( w, SIGNAL( message(const QString&) ), statusBar(), SLOT( message(const QString&)) );
	connect( w, SIGNAL( message(const QString&, int) ), statusBar(), SLOT( message(const QString&, int )) );
	connect( w, SIGNAL( layerAdded( QString&, int ) ), layerPanel, SLOT( addItem( QString&, int ) ) );
	connect( w, SIGNAL( addLayerPanelItem( QString&, int, bool ) ), layerPanel, SLOT( addItem( QString&, int, bool ) ) );
	connect( w, SIGNAL( layerRemoved( int ) ), layerPanel, SLOT( removeItem( int ) ) );
	connect( w, SIGNAL( layerAddedAt( int, QString& ) ), layerPanel, SLOT( addItemAfter( int, QString& ) ) );
	connect( w, SIGNAL( cosmeticLayer( bool ) ), this, SLOT( showShapeTools( bool ) ) );
	connect( w, SIGNAL( focused() ), this, SLOT( windowFocused() ) );
	connect( w, SIGNAL( closed() ), layerPanel, SLOT( removeAllItems() ) );
	connect( layerPanel, SIGNAL( visibilityChanged( int, bool ) ), this, SLOT( changeVisibility( int, bool ) ) );
	w->setCaption("Unnamed.smproj");
    w->showMaximized();
    layerPanel->removeAllItems();
    return w;
}

void
ApplicationWindow::load() {
    QString fn = QFileDialog::getOpenFileName(
			                    QDir::currentDirPath(),
			                    "SmartMap Project (*.smproj)",
			                    this,
			                    "open project dialog"
		                    	"Choose a filename to open project" );
    if ( !fn.isEmpty() ) {
		ProjectWindow* w = newProj();
		w->load( fn );
    }  else {
		statusBar()->message( "Loading aborted", 2000 );
    }
}

void
ApplicationWindow::save() {
    ProjectWindow* m = (ProjectWindow*)ws->activeWindow();
    if ( m )
		m->save();
}


void
ApplicationWindow::saveAs() {
    ProjectWindow* m = (ProjectWindow*)ws->activeWindow();
    if ( m )
		m->saveAs();
}


void
ApplicationWindow::print() {
#ifndef QT_NO_PRINTER
//    ProjectWindow* m = (ProjectWindow*)ws->activeWindow();
//    if ( m )
//		m->print( printer );
#endif
}


void
ApplicationWindow::closeWindow() {
    ProjectWindow* m = (ProjectWindow*)ws->activeWindow();
    if ( m ) {
		m->close();
		layerPanel->removeAllItems();
	}
}

void
ApplicationWindow::about() {
	SMAbout *aboutbox = new SMAbout( this, "", true );
	aboutbox->show();
}


void
ApplicationWindow::aboutQt() {
    QMessageBox::aboutQt( this, SMInfo::longName() );
}


void
ApplicationWindow::windowsMenuAboutToShow() {
    windowsMenu->clear();
    int cascadeId = windowsMenu->insertItem("&Cascade", ws, SLOT(cascade() ) );
    int tileId = windowsMenu->insertItem("&Tile", ws, SLOT(tile() ) );
    int horTileId = windowsMenu->insertItem("Tile &Horizontally", this, SLOT(tileHorizontal() ) );
    if ( ws->windowList().isEmpty() ) {
		windowsMenu->setItemEnabled( cascadeId, FALSE );
		windowsMenu->setItemEnabled( tileId, FALSE );
		windowsMenu->setItemEnabled( horTileId, FALSE );
    }
    windowsMenu->insertSeparator();
    QWidgetList windows = ws->windowList();
    for ( int i = 0; i < int(windows.count()); ++i ) {
		int id = windowsMenu->insertItem(windows.at(i)->caption(),
					 this, SLOT( windowsMenuActivated( int ) ) );
		windowsMenu->setItemParameter( id, i );
		windowsMenu->setItemChecked( id, ws->activeWindow() == windows.at(i) );
    }
}

void
ApplicationWindow::windowsMenuActivated( int id ) {
    ProjectWindow* w = (ProjectWindow*)ws->windowList().at( id );
    if ( w ) {
		w->showNormal();
	    w->setFocus();
		layerPanel->removeAllItems();
		for ( int i=w->layerCount()-1; i>=0; i-- ) {
			int n = w->layerCount() - ( i + 1 );
			layerPanel->addItem( w->layerName( n ), n, w->isVisible( n ) );
		}
	}
}

void
ApplicationWindow::windowFocused() {
    ProjectWindow* w = (ProjectWindow*)ws->activeWindow();

    if ( w ) {
		w->showMaximized();
	    w->setFocus();
		layerPanel->removeAllItems();
		for ( int i=w->layerCount()-1; i>=0; i-- ) {
			int n = w->layerCount() - ( i + 1 );
			layerPanel->addItem( w->layerName( n ), n, w->isVisible( n ) );
		}
	}
}

void
ApplicationWindow::tileHorizontal() {
    // primitive horizontal tiling
    QWidgetList windows = ws->windowList();
    if ( !windows.count() )
	return;

    int heightForEach = ws->height() / windows.count();
    int y = 0;
    for ( int i = 0; i < int(windows.count()); ++i ) {
	QWidget *window = windows.at(i);
	if ( window->testWState( WState_Maximized ) ) {
	    // prevent flicker
	    window->hide();
	    window->showNormal();
	}
	int preferredHeight = window->minimumHeight()+window->parentWidget()->baseSize().height();
	int actHeight = QMAX(heightForEach, preferredHeight);

	window->parentWidget()->setGeometry( 0, y, ws->width(), actHeight );
	y += actHeight;
    }
}

void
ApplicationWindow::closeEvent( QCloseEvent *e ) {
    QWidgetList windows = ws->windowList();
    if ( windows.count() ) {
		for ( int i = 0; i < int(windows.count()); ++i ) {
			QWidget *window = windows.at( i );
			if ( !window->close() ) {
				e->ignore();
				return;
			}
		}
    }

    QMainWindow::closeEvent( e );
}

void
ApplicationWindow::cut() {
	ProjectWindow* m = (ProjectWindow*)ws->activeWindow();
	if ( m )
		m->cut();
}

void
ApplicationWindow::copy() {
	ProjectWindow* m = (ProjectWindow*)ws->activeWindow();
	if ( m )
		m->copy();
}

void
ApplicationWindow::paste() {
	ProjectWindow* m = (ProjectWindow*)ws->activeWindow();
	if ( m )
		m->paste();
}

void
ApplicationWindow::del() {
	ProjectWindow* m = (ProjectWindow*)ws->activeWindow();
	if ( m )
		m->del();
}

void
ApplicationWindow::copyImageToFile() {
	ProjectWindow* m = (ProjectWindow*)ws->activeWindow();
	if ( m )
		m->copyImageToFile();
}

void
ApplicationWindow::addLayer() {
	ProjectWindow* m = (ProjectWindow*)ws->activeWindow();
	if ( m )
		m->addLayer();
}

void
ApplicationWindow::addCosmeticLayer() {
	ProjectWindow* m = (ProjectWindow*)ws->activeWindow();
	if ( m )
		m->addCosmeticLayer();
}

void
ApplicationWindow::removeLayer() {
	ProjectWindow* m = (ProjectWindow*)ws->activeWindow();
	if ( m )
		m->removeLayer();
}

void
ApplicationWindow::layerManager() {
	ProjectWindow* m = (ProjectWindow*)ws->activeWindow();
	if ( m )
		m->layerManager();
}

void
ApplicationWindow::zoomFull() {
	ProjectWindow* m = (ProjectWindow*)ws->activeWindow();
	if ( m )
		m->zoomFull();
}

void
ApplicationWindow::zoomIn() {
	ProjectWindow* m = (ProjectWindow*)ws->activeWindow();
	if ( m ) {
		m->zoomIn();
		toolsZoomOut->setOn( false );
		toolsPan->setOn( false );
		toolsIdentify->setOn( false );
		shapesPoint->setOn( false );
		shapesLine->setOn( false );
		shapesCircle->setOn( false );
		shapesPolygon->setOn( false );
	} else {
		toolsZoomIn->setOn( false );
	}
}

void
ApplicationWindow::zoomOut() {
	ProjectWindow* m = (ProjectWindow*)ws->activeWindow();
	if ( m ) {
		m->zoomOut();
		toolsZoomIn->setOn( false );
		toolsPan->setOn( false );
		toolsIdentify->setOn( false );
		shapesPoint->setOn( false );
		shapesLine->setOn( false );
		shapesCircle->setOn( false );
		shapesPolygon->setOn( false );
	} else {
		toolsZoomOut->setOn( false );
	}
}

void
ApplicationWindow::pan() {
	ProjectWindow* m = (ProjectWindow*)ws->activeWindow();
	if ( m ) {
		m->pan();
		toolsZoomIn->setOn( false );
		toolsZoomOut->setOn( false );
		toolsIdentify->setOn( false );
		shapesPoint->setOn( false );
		shapesLine->setOn( false );
		shapesCircle->setOn( false );
		shapesPolygon->setOn( false );
	} else {
		toolsPan->setOn( false );
	}
}

void
ApplicationWindow::identify() {
	ProjectWindow* m = (ProjectWindow*)ws->activeWindow();
	if ( m ) {
		m->identify();
		toolsZoomIn->setOn( false );
		toolsZoomOut->setOn( false );
		toolsPan->setOn( false );
		shapesPoint->setOn( false );
		shapesLine->setOn( false );
		shapesCircle->setOn( false );
		shapesPolygon->setOn( false );
	} else {
		toolsIdentify->setOn( false );
	}
}

void
ApplicationWindow::drawPoint() {
	ProjectWindow* m = (ProjectWindow*)ws->activeWindow();
	if ( m ) {
		m->drawPoint();
		shapesLine->setOn( false );
		shapesCircle->setOn( false );
		shapesPolygon->setOn( false );
		toolsZoomIn->setOn( false );
		toolsZoomOut->setOn( false );
		toolsPan->setOn( false );
		toolsIdentify->setOn( false );
	}
}

void
ApplicationWindow::drawLine() {
	ProjectWindow* m = (ProjectWindow*)ws->activeWindow();
	if ( m ) {
		m->drawLine();
		shapesPoint->setOn( false );
		shapesCircle->setOn( false );
		shapesPolygon->setOn( false );
		toolsZoomIn->setOn( false );
		toolsZoomOut->setOn( false );
		toolsPan->setOn( false );
		toolsIdentify->setOn( false );
	}
}

void
ApplicationWindow::drawCircle() {
	ProjectWindow* m = (ProjectWindow*)ws->activeWindow();
	if ( m ) {
		m->drawCircle();
		shapesPoint->setOn( false );
		shapesLine->setOn( false );
		shapesPolygon->setOn( false );
		toolsZoomIn->setOn( false );
		toolsZoomOut->setOn( false );
		toolsPan->setOn( false );
		toolsIdentify->setOn( false );
	}
}

void
ApplicationWindow::drawPolygon() {
	ProjectWindow* m = (ProjectWindow*)ws->activeWindow();
	if ( m ) {
		m->drawPolygon();
		shapesPoint->setOn( false );
		shapesLine->setOn( false );
		shapesCircle->setOn( false );
		toolsZoomIn->setOn( false );
		toolsZoomOut->setOn( false );
		toolsPan->setOn( false );
		toolsIdentify->setOn( false );
	}
}

void
ApplicationWindow::changeVisibility( int i, bool b ) {
	ProjectWindow* m = (ProjectWindow*)ws->activeWindow();
	if ( m )
		m->changeVisibility( i, b );
}

void
ApplicationWindow::showShapeTools( bool flag ) {
	if ( flag ) {
		shapesTools->show();
		//shapesPoint->setOn( false );
		//shapesLine->setOn( false );
		//shapesCircle->setOn( false );
		//shapesPolygon->setOn( false );
	} else {
		shapesTools->hide();
	}
}

void
ApplicationWindow::helpContents() {
	// Help contents code goes here
}
